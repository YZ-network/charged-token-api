# CT-api

# Load testing

## Preparation

### Install and configure geth

Download [geth](https://geth.ethereum.org/downloads) executable and then run it in dev mode :

```
geth --dev --dev.period 30 --dev.gaslimit 60000000 --http --ws --http.corsdomain '*' --ws.origins '*'
```

Those arguments allow for a blocktime of 30 seconds and enable HTTP and WebSocket API endpoints (respective ports 8545 and 8546).
That way will preload a new account each time with a lot of ethers we need to transfer to the testing accounts.

Connect to the running geth in another terminal using the command :

```
geth attach http://127.0.0.1:8545
```

A console to the geth instance will open where you can run the transactions below :

```
eth.sendTransaction({from: eth.coinbase, to: "0x55b0FF14E5e559Cc69c64D0137C477f82d1e66B2", value: web3.toWei(1000, "ether")})
eth.sendTransaction({from: eth.coinbase, to: "0x46785AB6A3DBa83F70524Bd22fAB436B32f141ea", value: web3.toWei(1000, "ether")})
```

You can also use a script :

```
geth --preload load-testing/init-owners-wallets.js attach http://127.0.0.1:8545
```

The two accounts listed will be used for the directory owner and our test project owner. The private keys for those accounts are :

```
d53488e371f2e0592cd4319d5127e5569c7692d2fdaf6608a5f555b8398bb9f1
820d9aa94f9d5951063381848df22331d09c75c0799112af3fde6fd5d68ffe01
```

Import those account to your metamask so that you can check you received 1000 ETH on each account.
The second account will be of use later to see changes happening in the dApp.

### Initialize the directory with sample contracts

Now with a live geth running and the two owners wallets filled with ethers, you are ready to run the loadinit script :

```
npx ts-node load-testing/init-directory.ts
```

If it was run for the first time since you started the dev blockchain, then all contract addresses will stay the same, no need to update the configuration anywhere.

At this point, you can clear your api database and start both the dApp and CT-api before going on.

### Run the load test

Once you are ready and have started both API and dApp, open your browser and start the load test :

```
npx ts-node load-testing/run-test.ts
```

The first run time will be very long, since it will generate 500 wallets for investors. On subsequent runs, it will only take some time loading those, since they are encrypted.
