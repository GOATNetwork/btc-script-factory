import BIP32Factory from "bip32";
import * as ecc from "tiny-secp256k1";
import { initEccLib, networks, Psbt, Transaction } from "bitcoinjs-lib";
import { BitcoinCoreWallet } from "walletprovider-ts/lib/providers/bitcoin_core_wallet";
import { buildDefaultBitcoinCoreWallet } from "./wallet.setting"
import { buildDepositScript } from "../src/covenantV1/bridge.script";
import { depositTransaction } from "../src/covenantV1/bridge";
import { signPsbtFromBase64 } from "./signpsbt";

const bip32 = BIP32Factory(ecc);
// import * as assert from 'assert';
const network = networks.regtest;

const bip39 = require("bip39")
// const rng = require("randombytes");

initEccLib(ecc);

const DEPOSIT_TIMELOCK = 20;
const ethAddress = "0x1234567890abcdef1234567890abcdef12345678";

const mnemonicArray = [
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton how",
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton are",
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton you",
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton hello"
];

async function deriveKey(mnemonic: string) {
    // Verify the above (Below is no different than other HD wallets)

    // let mnemonic = "worth pottery emotion apology alone coast evil tortoise calm normal cotton exchange";
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // const rootKey = bip32.fromSeed(rng(64), network);
    const rootKey = bip32.fromSeed(seed, network);
    // https://github.com/bitcoinjs/bip32/blob/master/test/index.js
    // const path = `m/86'/0'/0'/0/0`; // Path to first child of receiving wallet on first account
    const path = "m/84'/1'/0'/0/0";
    return rootKey.derivePath(path);
}

const lockingAmount = 1e6; // Satoshi
async function initAccount(numCovenants: number): Promise<any[]> {
    let accounts = new Array(numCovenants);
    // operator, covenants...covenants+numConv
    for (let i = 0; i < accounts.length; i++) {
        accounts[i] = await deriveKey(mnemonicArray[i]);
    }
    return accounts;
}

class DepositProtocol {
    covenants: any[]
    wallet: BitcoinCoreWallet
    depositTx: Transaction
    scripts: any

    constructor(covenants: any[]) {
        this.covenants = covenants;
        this.wallet = buildDefaultBitcoinCoreWallet(); // operator
        this.depositTx = new Transaction;
        this.scripts = null;
        // this.wallet.walletPassphrase('btcstaker', 3600);
    }

    async buildScripts() {
      const posPubkey = "d6ce14162f3954bac0fff55a12b6df7d614801f358b5d910fe7986a47102e65712"
      const depositScript = buildDepositScript(
        ethAddress.startsWith("0x") ?
          Buffer.from(ethAddress.slice(2), "hex") :
          Buffer.from(ethAddress, "hex"),
        Buffer.from(posPubkey, "hex")
      );
        this.scripts = {
          depositScript
        }
        return {
          posPubkey,
          ethAddress,
          scripts: this.scripts
        }
    }

  async deposit() {
    const { posPubkey, ethAddress, scripts } = await this.buildScripts();
    console.log("posPubkey: ", posPubkey);
    console.log("ethAddress", ethAddress);

    const changeAddress = await this.wallet.getAddress();
    console.log('changeAddress: ', changeAddress);
    const inputUTXOs = await this.wallet.getUtxos(changeAddress, lockingAmount + 5e7);
    const feeRate = 1000;

    const { psbt, fee } = depositTransaction(
      scripts,
      lockingAmount,
      changeAddress,
      inputUTXOs,
      network,
      feeRate
    );
    console.log("fee: ", fee)

    const signedDepositPsbtHex = await this.wallet.signPsbt(psbt.toHex());
    const signedDepositPsbt = Psbt.fromHex(signedDepositPsbtHex);

    const tx = signedDepositPsbt.extractTransaction();
    const txHex = tx.toHex();

    await this.mine(10, await this.wallet.getAddress());

    const receipt = await this.wallet.pushTx(txHex);

    console.log(`txid: ${receipt}`)

    this.depositTx = Transaction.fromHex(txHex);
  }

    async send() {
        await this.mine(20, await this.wallet.getAddress());
        console.log("Send");
        let { fastestFee } = await this.wallet.getNetworkFees();
        // let depositOutputIndex = 0;
        let sendAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
        console.log(`fastestFee ${fastestFee}, send address ${sendAddress}`)
    }

    async check_balance() {
        console.log("Wallet balance: ", await this.wallet.getBalance());
    }

    async mine(bn: number, addr: string) {
        await this.wallet.mine(bn, addr);
    }

    async fuel(receiver: string) {
        // give Alice 2 unspent outputs
        let walletAddress = await this.wallet.getAddress();
        console.log(`wallet address ${walletAddress}`);
        let value = 1e8;
        let utxos = await this.wallet.getUtxos(walletAddress, value);

        let change = 0;
        let psbt = new Psbt({ network });
        for (let utxoIndex = 0; utxoIndex < utxos.length; utxoIndex++) {
            console.log("Utxo[0]: ", utxos[utxoIndex]);

            let prevTxData = await this.wallet.getTransaction(utxos[utxoIndex].txid);
            console.log("prevous tx data, value: ", prevTxData, utxos[utxoIndex].value);
            const version = 1;
            psbt.setVersion(version);
            psbt.addInput({
                hash: utxos[utxoIndex].txid,
                index: utxos[utxoIndex].vout,
                nonWitnessUtxo: Buffer.from(prevTxData, "hex")
            });

            change += utxos[utxoIndex].value;
        }
        change -= value;

        console.log("Add output");
        console.log(`receiver ${receiver}`);
        psbt.addOutputs(
            [{
                address: receiver,
                value
            },
                {
                    address: walletAddress, // change address
                    value: change - 45000
                }
            ]);

        let privateKey = await this.wallet.dumpPrivKey();
        let txHex = await signPsbtFromBase64(psbt.toBase64(), [privateKey], true);

        let receipt = await this.wallet.pushTx(txHex)
        console.log(`txid: ${receipt}`)

        await this.mine(10, await this.wallet.getAddress());
    }
}

async function run() {
    let accounts = await initAccount(3);
    let bridgeProtocol = new DepositProtocol(accounts.slice(0));

    await bridgeProtocol.check_balance();
    // send token to operator
    /*
     await depositProtocol.fuel(await getAddress(depositProtocol.fps[0]));
     await depositProtocol.fuel(await getAddress(depositProtocol.covenants[0]));
     await depositProtocol.fuel(await getAddress(depositProtocol.covenants[1]));
     await depositProtocol.fuel(await getAddress(depositProtocol.covenants[2]));
     */

    await bridgeProtocol.check_balance();

    await bridgeProtocol.wallet.walletPassphrase("btcstaker", 1000);

  // recapture timelock
    {
        // await bridgeProtocol.mine(DEPOSIT_TIMELOCK, await bridgeProtocol.wallet.getAddress());
        // await bridgeProtocol.check_balance();
        // await bridgeProtocol.deposit();
        // await bridgeProtocol.check_balance();
        // await bridgeProtocol.recaptureTimelock();
    }

    // send
    {
      await bridgeProtocol.mine(DEPOSIT_TIMELOCK, await bridgeProtocol.wallet.getAddress());
      await bridgeProtocol.check_balance();
      await bridgeProtocol.deposit();
      await bridgeProtocol.check_balance();
      await bridgeProtocol.send();
    }
}

run().then(() => {
    console.log("Done");
    process.exit()
})
