import { Wallet, ethers } from "ethers";
import { contracts } from "../src/blockchain/contracts";

// don't check invalid type definitions for solc
const { linkBytecode, findLinkReferences } = require("solc/linker");

// testing accounts
const DIR_OWNER_PK = "d53488e371f2e0592cd4319d5127e5569c7692d2fdaf6608a5f555b8398bb9f1";
const OWNER_PK = "820d9aa94f9d5951063381848df22331d09c75c0799112af3fde6fd5d68ffe01";

const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");

const dirOwnerWallet = new Wallet(DIR_OWNER_PK).connect(provider);
const ownerWallet = new Wallet(OWNER_PK).connect(provider);

// number of charge token contracts to deploy
const ctCount = 10;

// prepare some maps for solc linking resolution
const SOURCE_MAP: Record<string, string> = {
  AddressSet: "library/AddressSet.sol:AddressSet",
  StringSet: "library/StringSet.sol:StringSet",
  SafeMath: "openzeppelin-solidity-2.0.1/contracts/math/SafeMath.sol:SafeMath",
};

const HASH_SOURCE: Record<string, string> = {};

function getSourceHashMapping(source: string): string {
  const sourceBytes = source.split("").map((c) => c.charCodeAt(0));
  return `$${ethers.utils.keccak256(sourceBytes).substr(2, 34)}$`;
}

Object.entries(SOURCE_MAP).forEach(([key, value]) => {
  const hash = getSourceHashMapping(value);
  HASH_SOURCE[hash] = value;
  HASH_SOURCE[value] = hash;
  SOURCE_MAP[value] = key;
});

// returns a complete libraries mapping, by name, by import and by hash
function resolveLibraries(bytecode: string, allLibraries: Record<string, string>): Record<string, string> {
  const references = findLinkReferences(bytecode);

  const uniqueRefs = new Set(Object.keys(references));
  const finalLibraries = { ...allLibraries };

  for (const ref of uniqueRefs) {
    const refSource = HASH_SOURCE[ref];
    const refName = SOURCE_MAP[refSource];

    if (allLibraries[refName] !== undefined) {
      finalLibraries[refSource] = allLibraries[refName];
      uniqueRefs.delete(ref);
      continue;
    }
  }

  if (uniqueRefs.size > 0) {
    throw new Error("UNMATCHED_CONTRACT_DEPENDENCIES");
  }

  return finalLibraries;
}

/**
 * Deploy the libraries and the directory, then log to the console all the needed addresses to update
 * the app configuration and loadtest script.
 *
 * This also whitelists the project owner in the directory.
 * @returns
 */
async function deployDirectory(): Promise<{ directory: ethers.Contract; libraries: Record<string, string> }> {
  const libraries = {
    SafeMath: await deployLibrary("SafeMath", contracts.SafeMath),
    AddressSet: await deployLibrary("AddressSet", contracts.AddressSet),
    StringSet: await deployLibrary("StringSet", contracts.StringSet),
  };

  const bytecode = contracts.ContractsDirectory.evm.bytecode.object;
  const linkedBytecode = linkBytecode(bytecode, resolveLibraries(bytecode, libraries));
  const contractFactory = new ethers.ContractFactory(contracts.ContractsDirectory.abi, linkedBytecode, dirOwnerWallet);

  console.log("Deploying directory at block", await provider.getBlockNumber());
  const directory = await contractFactory.deploy();
  await directory.deployTransaction.wait();

  console.log("=== Deployed libraries :");
  console.log(JSON.stringify(libraries, null, 2));
  console.log("=== Deployed directory :", directory.address);

  console.log("Whitelisting project owner");
  const tx = await directory.whitelistProjectOwner(ownerWallet.address, "Test");
  await tx.wait();

  console.log("Completed directory deployment at block", await provider.getBlockNumber());

  return { directory, libraries };
}

/**
 * Deploy a charged token for the loadtest and add it to the directory.
 * @returns
 */
async function deployChargedToken(
  directory: ethers.Contract,
  libraries: Record<string, string>,
): Promise<ethers.Contract> {
  console.log("Deploying a charged token");

  const bytecode = contracts.LiquidityToken.evm.bytecode.object;
  const linkedBytecode = linkBytecode(bytecode, resolveLibraries(bytecode, libraries));
  const contractFactory = new ethers.ContractFactory(contracts.LiquidityToken.abi, linkedBytecode, ownerWallet);

  const million = ethers.utils.parseEther("1000000");
  const instance = await contractFactory.deploy("Test", "ctTST", "1000", "0", "0", "0", "0", million, million, million);
  await instance.deployTransaction.wait();

  console.log("Adding it to the directory");

  const tx = await directory.connect(ownerWallet).addLTContract(instance.address);
  await tx.wait();

  return instance;
}

/**
 * Deploys a project token if needed and an interface to link it with the charged token.
 * @param ct
 * @param libraries
 * @returns address of the project token
 */
async function createInterface(
  ct: ethers.Contract,
  libraries: Record<string, string>,
  ptAddress?: string,
): Promise<string> {
  let pt: ethers.Contract;

  if (ptAddress === undefined) {
    console.log("Deploying project token");
    const ptBytecode = contracts.ProjectToken.evm.bytecode.object;
    const ptLinkedBytecode = linkBytecode(ptBytecode, resolveLibraries(ptBytecode, libraries));
    const ptContractFactory = new ethers.ContractFactory(contracts.ProjectToken.abi, ptLinkedBytecode, ownerWallet);

    pt = await ptContractFactory.deploy("Final Test", "TST");
    await pt.deployTransaction.wait();

    ptAddress = pt.address;
  } else {
    console.log("Using existing project token", ptAddress);
    pt = new ethers.Contract(ptAddress, contracts.DelegableToLT.abi, ownerWallet);
  }

  console.log("Deploying interface");
  const ifBytecode = contracts.InterfaceProjectToken.evm.bytecode.object;
  const ifLinkedBytecode = linkBytecode(ifBytecode, resolveLibraries(ifBytecode, libraries));
  const ifContractFactory = new ethers.ContractFactory(
    contracts.InterfaceProjectToken.abi,
    ifLinkedBytecode,
    ownerWallet,
  );

  const iface = await ifContractFactory.deploy(ct.address, pt.address);
  await iface.deployTransaction.wait();

  console.log("Adding interface to project token's whitelist");

  const tx = await pt.addInterfaceProjectToken(iface.address);
  await tx.wait();

  console.log("Setting interface address on charged token");

  const tx2 = await ct.setInterfaceProjectToken(iface.address);
  await tx2.wait();

  return ptAddress;
}

/**
 * Deploys a standalone library.
 *
 * @param name
 * @param contract
 * @returns
 */
async function deployLibrary(name: string, contract: any): Promise<string> {
  console.log("Deploying library", name);

  const bytecode = contract.evm.bytecode.object;
  const abi = contract.abi;
  const contractFactory = new ethers.ContractFactory(abi, bytecode, dirOwnerWallet);
  const instance = await contractFactory.deploy();
  await instance.deployTransaction.wait();

  console.log(name, "deployed at", instance.address);

  return instance.address;
}

deployDirectory()
  .then(async ({ directory, libraries }) => {
    console.log("started deploying contracts at block", await provider.getBlockNumber());
    let ptAddress: string | undefined;
    for (let i = 0; i < ctCount; i++) {
      const ct = await deployChargedToken(directory, libraries);
      ptAddress = await createInterface(ct, libraries, ptAddress);
    }
    console.log(
      "Everything is ready for the load test. Don't forget to copy setup addresses to the api and dApp if needed. Final block number :",
      await provider.getBlockNumber(),
    );
  })
  .catch((err) => console.error(err));
