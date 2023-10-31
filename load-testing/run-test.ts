import { Wallet, ethers } from "ethers";
import fs from "fs/promises";
import request from "request";
import { contracts } from "../src/contracts";

// TODO : the directory address should be updated according to the loadinit script result
const DIRECTORY = "0xE6476703330518ceB4a2577b9eBCa730B2cdD0F7";

// wallet dir is relative to the project root
const WALLET_DIR = "./load-testing/wallets";
const WALLET_PASSWORD = "toto55";

const chainId = 1337;
const INVESTORS_COUNT = 500;
const OWNER_PK = "820d9aa94f9d5951063381848df22331d09c75c0799112af3fde6fd5d68ffe01";

const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");

const ownerWallet = new Wallet(OWNER_PK).connect(provider);
const directory = new ethers.Contract(DIRECTORY, contracts.ContractsDirectory.abi, provider);

console.log("owners address :", ownerWallet.address);

/**
 * Call this method to generate random wallets and save them in json files under wallets directory.
 * @returns
 */
async function generateWallets() {
  console.log("generating", INVESTORS_COUNT - 1, "investors wallets");

  const investorsWallets: Wallet[] = [];
  for (let i = 0; i < investorsWallets.length; i++) {
    investorsWallets.push(Wallet.createRandom());
  }

  console.log("saving generated wallets");
  for (let i = 0; i < investorsWallets.length; i++) {
    const encryptedWallet = await investorsWallets[i].encrypt(WALLET_PASSWORD);
    await fs.writeFile(`${WALLET_DIR}/${investorsWallets[i].address}.json`, encryptedWallet);
  }

  return investorsWallets;
}

/**
 * Loads and return all existing wallets addresses in the wallets folder.
 * @returns
 */
async function loadAddressesFromFs() {
  console.log("loading investors addresses");

  const walletFiles = await fs.readdir(WALLET_DIR);

  return walletFiles.map((file) => file.replace(".json", ""));
}

/**
 * Loads and return all existing json wallets in the wallets folder for signing txs purpose.
 * @returns
 */
async function loadWalletsFromFs() {
  console.log("loading investors wallets");

  const walletFiles = await fs.readdir(WALLET_DIR);

  const investorsWallets: Wallet[] = await Promise.all(
    walletFiles.map(async (file) => {
      const content = await fs.readFile(`${WALLET_DIR}/${file}`, "ascii");
      return Wallet.fromEncryptedJsonSync(content, WALLET_PASSWORD).connect(provider);
    }),
  );

  console.log("loaded ", investorsWallets.length, " wallets from disk");

  return investorsWallets;
}

/**
 * Transfer minimum ether amount to each wallet to allow for sending txs.
 * @param investorsWallets
 * @returns
 */
async function fillWallets(investorsAddresses: string[]) {
  console.log("sending ethers to investors wallets");
  const transferAmount = ethers.utils.parseEther("0.1");

  const initialNonce = await ownerWallet.getTransactionCount();
  const preTransferTxs = [];
  for (let i = 0; i < investorsAddresses.length; i++) {
    const txBody = {
      chainId,
      from: ownerWallet.address,
      to: investorsAddresses[i],
      value: transferAmount,
      nonce: initialNonce + i,
    };
    preTransferTxs.push(txBody);
  }
  const transferTxs = await Promise.all(
    preTransferTxs.map(async (txBody) => await ownerWallet.sendTransaction(txBody)),
  );

  console.log("waiting for transactions to be mined");
  await Promise.all(transferTxs.map(async (tx) => await tx.wait()));

  console.log("all tx have been mined");
}

/**
 * Preload all investors balances to create them in db.
 */
async function preloadInvestorsBalances(investorsWallets: Wallet[]) {
  // load all balances beforehand
  console.log("loading all investors balances");
  await Promise.all(
    [ownerWallet, ...investorsWallets].map(
      (wallet) =>
        new Promise<void>((resolve, reject) =>
          request.post(
            "http://127.0.0.1:4000/graphql",
            {
              headers: {
                Origin: "http://localhost:3000",
              },
              json: {
                operationName: "getUserBalances",
                variables: { chainId: 1337, user: wallet.address },
                query:
                  "query getUserBalances($chainId: Int!, $user: String!) {\n  userBalances(chainId: $chainId, user: $user) {\n    user\n    address\n    balance\n    balancePT\n    fullyChargedBalance\n    partiallyChargedBalance\n    dateOfPartiallyCharged\n    claimedRewardPerShare1e18\n    valueProjectTokenToFullRecharge\n    __typename\n  }\n}",
              },
            },
            function (error, response, body) {
              if (!error && response.statusCode == 200) {
                resolve();
              } else {
                reject(error);
              }
            },
          ),
        ),
    ),
  );
  console.log("done loading balances");
}

/**
 * Allocate charged tokens to everyone.
 * @param investorsWallets
 * @returns
 */
async function allocateCT(ct: ethers.Contract, investorsAddresses: string[]) {
  console.log("allocating Charged Tokens to investors");
  const allocateAmount = ethers.utils.parseEther("1000");

  // create allocations
  let nonce = await provider.getTransactionCount(ownerWallet.address);
  const txs = await Promise.all(
    [ownerWallet.address, ...investorsAddresses].map(async (address) =>
      ct.allocateLTByOwner([address], [allocateAmount.toString()], true, { nonce: nonce++ }),
    ),
  );
  console.log("sent all allocations transactions");

  console.log("waiting for transactions to be mined");
  await Promise.all(txs.map(async (tx) => await tx.wait()));

  console.log("all tx have been mined");
}

/**
 * Claim project tokens for everyone.
 * @param investorsWallets
 * @returns
 */
async function claimPT(iface: ethers.Contract, investorsWallets: Wallet[]) {
  console.log("claiming project tokens for investors");

  // claim transactions
  const txs = await Promise.all(
    [ownerWallet, ...investorsWallets].map(async (wallet) => iface.connect(wallet).claimProjectToken()),
  );
  console.log("Sent all claim transactions");

  console.log("waiting for transactions to be mined");
  await Promise.all(txs.map(async (tx) => await tx.wait()));

  console.log("all tx have been mined");
}

/**
 * Wraps all steps together.
 */
async function mainTest() {
  let investorsAddresses = await loadAddressesFromFs();
  let investorsWallets = investorsAddresses.length === 0 ? await generateWallets() : await loadWalletsFromFs();

  if (investorsAddresses.length !== investorsWallets.length) {
    investorsAddresses = investorsWallets.map((wallet) => wallet.address);
  }

  await fillWallets(investorsAddresses);
  await preloadInvestorsBalances(investorsWallets);

  const ctAddress = await directory.getLTContract(0);
  const ct = new ethers.Contract(ctAddress, contracts.LiquidityToken.abi, ownerWallet);

  await allocateCT(ct, investorsAddresses);

  const ifaceAddress = await ct.interfaceProjectToken();
  const iface = new ethers.Contract(ifaceAddress, contracts.InterfaceProjectToken.abi, ownerWallet);

  // setting start to 5 minutes away
  console.log("setting TGE");
  const startDate = Math.ceil(new Date().getTime() / 1000) + 300;

  const tx = await iface.setStart(startDate);
  await tx.wait();

  // waiting for 5 minute to ensure TGE is passed
  console.log("waiting for TGE");
  await new Promise((resolve) => setTimeout(resolve, 300000));

  await claimPT(iface, investorsWallets);
}

mainTest()
  .then(() => console.log("done testing"))
  .catch((err) => console.error(err));
