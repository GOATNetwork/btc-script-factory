import * as ecc from "tiny-secp256k1";
import { initEccLib, networks, Psbt, Transaction } from "bitcoinjs-lib";
import * as bridge from "../src/slashable/bridge";
import * as bridgeScript from "../src/slashable/bridge/script";
import { BitcoinCoreWallet } from "walletprovider-ts/lib/providers/bitcoin_core_wallet";
import { mnemonicArray, deriveKey, buildDefaultBitcoinCoreWallet } from "./wallet.setting"
import { signPsbtFromBase64 } from "./signpsbt";
const network = networks.regtest;
initEccLib(ecc);

const DEPOSIT_TIMELOCK = 20;
const ethAddress = "0x1234567890abcdef1234567890abcdef12345678";

const lockingAmount = 5e7; // Satoshi
async function initAccount(numCovenants: number): Promise<any[]> {
    let accounts = new Array(numCovenants);
    // operator, covenants...covenants+numConv
    for (let i = 0; i < accounts.length; i++) {
        accounts[i] = await deriveKey(mnemonicArray[i], network);
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
        this.wallet.walletPassphrase("btcstaker", 3600);
    }

    async buildScripts() {
        let operatorAddress = await this.wallet.getAddress();
        let pubKey = await this.wallet.getPublicKey(operatorAddress);
        console.log("operator address", operatorAddress);
        console.log("operator public key", pubKey);
        let userPk = Buffer.from(pubKey, "hex").subarray(1, 33);

        let covenantsPks = this.covenants.map((x: any) => {
            return Buffer.from(x.publicKey, "hex").subarray(1, 33);
        });
        // FIXME: n-of-n limited?
        let covenantThreshold = covenantsPks.length;
        let scriptData = new bridgeScript.BridgeScriptData(
            userPk,
            covenantsPks,
            covenantThreshold,
            DEPOSIT_TIMELOCK,
            Buffer.from("676f6174", "hex"), // goat
            ethAddress.startsWith("0x") ? Buffer.from(ethAddress.slice(2), "hex") : Buffer.from(ethAddress, "hex")
        );
        this.scripts = scriptData.buildScripts();
        return {
            operatorAddress,
            pubKey,
            userPk
        }
    }

    async deposit() {
        const { userPk, operatorAddress } = await this.buildScripts();


        let changeAddress = await this.wallet.getAddress();
        let inputUTXOs = await this.wallet.getUtxos(operatorAddress);
        let feeRate = 1000;
        let publicKeyNoCoord = userPk;

        let lockHeight = await this.wallet.getBTCTipHeight() + 10;

        let { psbt } = bridge.depositTransaction(this.scripts, lockingAmount, changeAddress, inputUTXOs, network, feeRate, publicKeyNoCoord, lockHeight);

        console.log("psbt base64:", psbt.toBase64())
        const signedDepositPsbtHex = await this.wallet.signPsbt(psbt.toHex());
        console.log("walltet signPsbt", signedDepositPsbtHex);
        let signedDepositPsbt = Psbt.fromHex(signedDepositPsbtHex);
        console.log("signPsbtFromBase64");

        // let receipt = await this.wallet.pushTx(depositTx);
        const tx = signedDepositPsbt.extractTransaction();
        const virtualSize = tx.virtualSize();
        console.log("deposit virtual Byte:", virtualSize);

        let txHex = tx.toHex();
        console.log("txHex: ", txHex);

        await this.mine(10, await this.wallet.getAddress());

        let receipt = await this.wallet.pushTx(txHex);
        console.log(`txid: ${receipt}`)
        this.depositTx = Transaction.fromHex(txHex);
    }

    async recaptureTimelock() {
        await this.mine(20, await this.wallet.getAddress());
        console.log("RecaptureTimelock");
        let recaptureAddress = await this.wallet.getAddress();
        let { fastestFee } = await this.wallet.getNetworkFees();
        console.log(`fastestFee ${fastestFee}, recaptureAddress ${recaptureAddress}`)
        let depositOutputIndex = 0;
        const unsignedRecapturePsbt: { psbt: Psbt, fee: number } = bridge.recaptureTransferTimelockTransaction(
            this.scripts,
            this.depositTx,
            recaptureAddress,
            network,
            fastestFee || 1000, // feeRate,
            depositOutputIndex
        );
        console.log("signPsbt");

        let keyPairs = [await this.wallet.dumpPrivKey()];
        const signedDepositPsbtHex = await signPsbtFromBase64(unsignedRecapturePsbt.psbt.toBase64(), keyPairs, true);

        console.log("pushTx", signedDepositPsbtHex);
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedDepositPsbtHex);
      console.log("receipt: ", receipt)
        await this.mine(20, await this.wallet.getAddress());
        this.check_balance();
    }

    async send() {
        await this.mine(20, await this.wallet.getAddress());
        console.log("Send");
        let { fastestFee } = await this.wallet.getNetworkFees();
        let depositOutputIndex = 0;
        let sendAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
        console.log(`fastestFee ${fastestFee}, send address ${sendAddress}`)
        const sendPsbt: { psbt: Psbt } = bridge.sendTransaction(
            this.scripts,
            this.depositTx,
            sendAddress,
            fastestFee || 1000, // feeRate,
            network,
            depositOutputIndex
        );
        console.log(await this.wallet.getAddress());

        let keyPairs = [
            this.covenants[0],
            this.covenants[1],
            this.covenants[2]
        ];
        console.log("signPsbt");
        const signedSendPsbtHex = await signPsbtFromBase64(sendPsbt.psbt.toBase64(), keyPairs, true);

        const tx = Transaction.fromHex(signedSendPsbtHex);
        const virtualSize = tx.virtualSize();
        console.log("send virtual Byte:", virtualSize);

        console.log("pushTx", signedSendPsbtHex);
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedSendPsbtHex);
        await this.mine(20, await this.wallet.getAddress());
        this.check_balance();
        console.log("receipt: ", receipt);
    }

    async depositP2SH() {
      console.log("depositP2SH")
      const { operatorAddress } = await this.buildScripts();


      let changeAddress = await this.wallet.getAddress();
      let inputUTXOs = await this.wallet.getUtxos(operatorAddress);
      let feeRate = 1000;

      let { psbt } = bridge.depositP2SHTransaction(
        this.scripts,
        lockingAmount,
        changeAddress,
        inputUTXOs,
        network,
        feeRate,
        this.covenants.map((x) => x.publicKey), this.covenants.length
      );

      console.log("psbt base64:", psbt.toBase64())
      const signedDepositPsbtHex = await this.wallet.signPsbt(psbt.toHex());
      console.log("walltet signPsbt", signedDepositPsbtHex);
      let signedDepositPsbt = Psbt.fromHex(signedDepositPsbtHex);
      console.log("signPsbtFromBase64");

      const tx = signedDepositPsbt.extractTransaction();

      const virtualSize = tx.virtualSize();
      console.log("depositP2SH virtual Byte:", virtualSize);

      const txHex = tx.toHex();
      console.log("txHex: ", txHex);

      await this.mine(10, await this.wallet.getAddress());

      let receipt = await this.wallet.pushTx(txHex);
      console.log(`txid: ${receipt}`)
      this.depositTx = Transaction.fromHex(txHex);
    }

    async sendP2SH() {
      console.log("sendP2SH");
      await this.mine(20, await this.wallet.getAddress());
      let { fastestFee } = await this.wallet.getNetworkFees();
      let depositOutputIndex = 0;
      let sendAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
      // console.log(`fastestFee ${fastestFee}, send address ${sendAddress}`)
      const sendPsbt : { psbt : Psbt; } = bridge.sendP2SHTransaction(
        this.depositTx,
        sendAddress,
        fastestFee || 1000, // feeRate,
        network,
        depositOutputIndex,
        this.covenants.map((x) => x.publicKey),
        this.covenants.length
      );
      console.log(await this.wallet.getAddress());

      let keyPairs = [
        this.covenants[0],
        this.covenants[1],
        this.covenants[2]
      ];
      console.log("signPsbt");
      const signedTransactionHex = await signPsbtFromBase64(sendPsbt.psbt.toBase64(), keyPairs, true);

      const tx = Transaction.fromHex(signedTransactionHex);
      const virtualSize = tx.virtualSize();
      console.log("sendP2SH virtual Byte:", virtualSize);

      console.log("pushTx", signedTransactionHex);
      this.check_balance();
      let receipt = await this.wallet.pushTx(signedTransactionHex);
      await this.mine(20, await this.wallet.getAddress());
      this.check_balance();
      console.log("receipt: ", receipt);
    }

    async depositP2PKH() {
      console.log("depositP2PKH")
      const { operatorAddress } = await this.buildScripts();


      let changeAddress = await this.wallet.getAddress();
      let inputUTXOs = await this.wallet.getUtxos(operatorAddress, lockingAmount * 2, true);
      let feeRate = 1000;


      let { psbt } = bridge.depositP2PKHTransaction(this.scripts, lockingAmount, changeAddress, inputUTXOs, network, feeRate, this.covenants[0]);

      console.log("psbt base64:", psbt.toBase64())
      const signedDepositPsbtHex = await this.wallet.signPsbt(psbt.toHex());
      console.log("walltet signPsbt", signedDepositPsbtHex);
      let signedDepositPsbt = Psbt.fromHex(signedDepositPsbtHex);
      console.log("signPsbtFromBase64");

      const tx = signedDepositPsbt.extractTransaction();

      const virtualSize = tx.virtualSize();
      console.log("depositP2PKH virtual Byte:", virtualSize);

      const txHex = tx.toHex();
      console.log("txHex: ", txHex);

      await this.mine(10, await this.wallet.getAddress());

      let receipt = await this.wallet.pushTx(txHex);
      console.log(`txid: ${receipt}`)
      this.depositTx = Transaction.fromHex(txHex);
    }

    async sendP2PKH() {
      console.log("sendP2PKH");
      await this.mine(20, await this.wallet.getAddress());
      let { fastestFee } = await this.wallet.getNetworkFees();
      let depositOutputIndex = 0;
      let sendAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
      // console.log(`fastestFee ${fastestFee}, send address ${sendAddress}`)
      const sendPsbt : { psbt : Psbt; } = bridge.sendP2PKHTransaction(
        this.depositTx,
        sendAddress,
        fastestFee || 1000, // feeRate,
        network,
        depositOutputIndex
      );
      // console.log(await this.wallet.getAddress());

      let keyPairs = [
        this.covenants[0],
        this.covenants[1],
        this.covenants[2]
      ];
      // console.log("signPsbt");
      sendPsbt.psbt.signInput(0, keyPairs[0]);
      const validateSignature = (pubkey: Buffer, msghash: Buffer, signature: Buffer) => {
        const secp256k1 = require("secp256k1");
        return secp256k1.ecdsaVerify(signature, msghash, pubkey);
      };

      const isValidSignature = sendPsbt.psbt.validateSignaturesOfInput(0, validateSignature);
      if (!isValidSignature) {
        throw new Error("Signature validation failed");
      }

      sendPsbt.psbt.finalizeAllInputs();
      const tx = sendPsbt.psbt.extractTransaction();

      const virtualSize = tx.virtualSize();
      console.log("sendP2PKH virtual Byte:", virtualSize);

      const signedSendPsbtHex = tx.toHex();

      console.log("pushTx", signedSendPsbtHex);
      this.check_balance();
      let receipt = await this.wallet.pushTx(signedSendPsbtHex);
      console.log("txid: ", receipt);
      await this.mine(20, await this.wallet.getAddress());
      this.check_balance();
    // console.log('receipt: ', receipt);
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

    // recapture timelock
    {
        // await bridgeProtocol.mine(DEPOSIT_TIMELOCK, await bridgeProtocol.wallet.getAddress());
        // await bridgeProtocol.check_balance();
        // await bridgeProtocol.deposit();
        // await bridgeProtocol.check_balance();
        // await bridgeProtocol.recaptureTimelock();
    }

    // send
    // {
    await bridgeProtocol.mine(DEPOSIT_TIMELOCK, await bridgeProtocol.wallet.getAddress());
    await bridgeProtocol.check_balance();
    await bridgeProtocol.deposit();
    await bridgeProtocol.check_balance();
    await bridgeProtocol.send();
    // }

    console.log("p2pkh: ")
    // p2sh/p2wsh send
    {
      await bridgeProtocol.mine(DEPOSIT_TIMELOCK, await bridgeProtocol.wallet.getAddress());
      await bridgeProtocol.check_balance();
      await bridgeProtocol.depositP2PKH();
      await bridgeProtocol.check_balance();
      await bridgeProtocol.sendP2PKH();
    }

    console.log("p2tr: ")
    // send
    {
      await bridgeProtocol.mine(DEPOSIT_TIMELOCK, await bridgeProtocol.wallet.getAddress());
      await bridgeProtocol.check_balance();
      await bridgeProtocol.deposit();
      await bridgeProtocol.check_balance();
      await bridgeProtocol.send();
    }

    console.log("p2ms in p2wsh: ")
    // p2sh/p2wsh send
    {
      await bridgeProtocol.mine(DEPOSIT_TIMELOCK, await bridgeProtocol.wallet.getAddress());
      await bridgeProtocol.check_balance();
      await bridgeProtocol.depositP2SH();
      await bridgeProtocol.check_balance();
      await bridgeProtocol.sendP2SH();
    }
}

run().then(() => {
    console.log("Done");
    process.exit()
})
