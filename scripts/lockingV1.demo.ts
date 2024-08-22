import { BIP32Interface } from "bip32";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, networks, opcodes, payments, Psbt, script as bitcoinScript, Transaction } from "bitcoinjs-lib";
import { BitcoinCoreWallet } from "walletprovider-ts/lib/providers/bitcoin_core_wallet";
import { mnemonicArray, deriveKey, buildDefaultBitcoinCoreWallet } from "./wallet.setting"
import { buildLockingScript } from "../src/covenantV1/locking.script";
import { lockingTransaction, withdrawalTimeLockTransaction, withdrawalUnbondingTransaction } from "../src/covenantV1/locking";
import { PsbtInput } from "bip174/src/lib/interfaces";
import { witnessStackToScriptWitness } from "bitcoinjs-lib/src/psbt/psbtutils";
const network = networks.regtest;

initEccLib(ecc);

const LOCKING_TIMELOCK = 60;

async function initAccount(numCovenants: number): Promise<BIP32Interface[]> {
  let accounts = new Array(numCovenants);
  // lockr, covenants...covenants+numConv
  for (let i = 0; i < accounts.length; i++) {
    accounts[i] = await deriveKey(mnemonicArray[i], network);
  }
  return accounts;
}

class LockingProtocol {
  covenants: any[]
  wallet: BitcoinCoreWallet
  lockingTx: Transaction
  unbondingTx: Transaction
  scripts: any
  // delegatorKey: string;
  ownerEvmAddress: string;
  validatorKey: Buffer;
  validator: BIP32Interface;
  validatorIndex: Buffer;
  nonce: Buffer;

  constructor(covenants: any[]) {
    this.covenants = covenants;
    this.wallet = buildDefaultBitcoinCoreWallet(); // lockr
    this.lockingTx = new Transaction;
    this.unbondingTx = new Transaction;
    this.scripts = null;
    // this.delegatorKey = "9261bdf7033ba64b2e0a9941ace9923b168c6a182ce37aa35fd16c0076d6aa19";
    this.ownerEvmAddress = "0x2915fd8beebdc822887deceac3dfe1540fac9c81";
    this.validator = covenants[0]; // BIP32Interface
    this.validatorKey = this.validator.publicKey;
    // this.validatorKey = "b012d9b1e987edc302d1e72ebc3c2910c1b4e9f8cd1f3b11f4686c41c7ef6db5";
    this.validatorIndex = Buffer.from("ef921bb0", "hex");
    this.nonce = Buffer.from("537d5579", "hex");
  }

  async getLockrPk() {
    await this.wallet.walletPassphrase("btcstaker", 1000);

    let lockrAddress = await this.wallet.getAddress();
    let pubKey = await this.wallet.getPublicKey(lockrAddress);
    let lockrPk = Buffer.from(pubKey, "hex").subarray(0, 33);
    return lockrPk;
  }

  async locking() {
    console.log("locking");
    const lockHeight = 5;
    console.log("lockHeight: ", lockHeight);
    // const lockrPk = await this.getLockrPk();
    const keyPair = await this.wallet.dumpPrivKey();

    const lockingScript = buildLockingScript(
      this.ownerEvmAddress.startsWith("0x") ?
        Buffer.from(this.ownerEvmAddress.slice(2), "hex") :
        Buffer.from(this.ownerEvmAddress, "hex"),
      keyPair.publicKey,
      this.validatorKey,
      lockHeight,
      this.validatorIndex,
      this.nonce
    );

    this.scripts = { lockingScript };

    const amount = 1e6; // 0.01 BTC
    const feeRate = 15;
    const changeAddress = await this.wallet.getAddress();
    const inputUTXOs = await this.wallet.getUtxos(changeAddress, amount + 5e7);
    console.log("inputUTXOs: ", inputUTXOs.length)

    const { psbt } = lockingTransaction(
      this.scripts,
      amount,
      changeAddress,
      inputUTXOs,
      network,
      feeRate,
      lockHeight
    )

    const signedLockingPsbtHex = await this.wallet.signPsbt(psbt.toHex());

    const signedLockingPsbt = Psbt.fromHex(signedLockingPsbtHex);

    const txHex = signedLockingPsbt.extractTransaction().toHex();

    console.log(`txHex: ${txHex}`);

    await this.mine(10, await this.wallet.getAddress());

    const receipt = await this.wallet.pushTx(txHex);

    console.log(`txid: ${receipt}`)

    this.lockingTx = Transaction.fromHex(txHex);
  }

  async withdrawTimelock() {
    console.log("withdrawTimelock");
    await this.mine(20, await this.wallet.getAddress());

    const withdrawalAddress = await this.wallet.getAddress();
    const feeRate = 15;
    const outputIndex = 0;

    const { psbt } = withdrawalTimeLockTransaction(
      this.scripts,
      this.lockingTx,
      withdrawalAddress,
      feeRate,
      network,
      outputIndex
    );

    const lockrKeyPair = await this.wallet.dumpPrivKey();

    psbt.signInput(0, lockrKeyPair);

    psbt.finalizeInput(0, (
      inputIndex: number,
      input: PsbtInput,
      script: Buffer) => {
        const payment = payments.p2wsh({
          network,
          redeem: {
            network,
            input: bitcoinScript.compile([
              input.partialSig![inputIndex].signature,
              Buffer.from(this.ownerEvmAddress.slice(2), "hex")
              // opcodes.OP_TRUE
            ]),
            output: script
          }
        })

        return {
          finalScriptSig: Buffer.from(""),
          finalScriptWitness: witnessStackToScriptWitness(payment.witness!)
        }
    })


    const tx = psbt.extractTransaction();

    const txHex = tx.toHex();

    const receipt = await this.wallet.pushTx(txHex);
    console.log(`txid: ${receipt}`)
  }

  async withdrawEarly() {
    console.log("withdrawEarly");
    await this.mine(20, await this.wallet.getAddress());

    const withdrawalAddress = await this.wallet.getAddress();
    const feeRate = 15;
    const outputIndex = 0;

    const { psbt } = withdrawalUnbondingTransaction(
      this.scripts,
      this.lockingTx,
      withdrawalAddress,
      feeRate,
      network,
      outputIndex
    );

    const combineBytes = Buffer.concat([
      this.validatorIndex,
      this.nonce
    ])

    const lockrKeyPair = await this.wallet.dumpPrivKey();

    psbt.signInput(0, lockrKeyPair);
    psbt.signInput(0, this.validator);


    psbt.finalizeInput(0, (
      inputIndex: number,
      input: PsbtInput,
      script: Buffer) => {
      console.log("Partial Signatures:");
      console.log(`\tLockr: ${input.partialSig![0].signature.toString("hex")}`);
      console.log(`\tValidator: ${input.partialSig![1].signature.toString("hex")}`);

      console.log("Public Keys:");
      console.log(`\tLockr: ${input.partialSig![0].pubkey.toString("hex")}`);
      console.log(`\tValidator: ${input.partialSig![1].pubkey.toString("hex")}`);

      const payment = payments.p2wsh({
        network,
        redeem: {
          network,
          input: bitcoinScript.compile([
            opcodes.OP_0,
            input.partialSig![1].signature,
            input.partialSig![0].signature,
            combineBytes
            // opcodes.FALSE
          ]),
          output: script
        }
      })

      return {
        finalScriptSig: Buffer.from(""),
        finalScriptWitness: witnessStackToScriptWitness(payment.witness!)
      }
    })

    const tx = psbt.extractTransaction();

    const txHex = tx.toHex();

    const receipt = await this.wallet.pushTx(txHex);
    console.log(`txid: ${receipt}`)
  }

  async check_balance() {
    console.log("Wallet balance: ", await this.wallet.getBalance());
    // console.log("Lockr balance: ", await this.wallet.getUtxos(await this.wallet.getAddress()));
  }

  async mine(bn: number, addr: string) {
    await this.wallet.mine(bn, addr);
    // console.log("Lockr balance: ", await this.wallet.getUtxos(await this.wallet.getAddress()));
  }

  async fuel() {
    // give Alice 2 unspent outputs
    let walletAddress = await this.wallet.getAddress();
    console.log(`wallet address ${walletAddress}`);
    let value = 1e8;
    let utxos = await this.wallet.getUtxos(walletAddress, value);

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
    }
  }
}

async function run() {
  let accounts = await initAccount(5);

  accounts.forEach((account: any) => console.log(account.publicKey.toString("hex")))
  let lockingProtocol = new LockingProtocol(accounts);

  await lockingProtocol.check_balance();
  // send token to lockr
  // await lockingProtocol.fuel(await getAddress(lockingProtocol.covenants[0]));
  // await lockingProtocol.fuel(await getAddress(lockingProtocol.covenants[1]));
  // await lockingProtocol.fuel(await getAddress(lockingProtocol.covenants[2]));

  await lockingProtocol.check_balance();

  await lockingProtocol.wallet.walletPassphrase("btcstaker", 1000);


  // withdraw timelock
  {
    await lockingProtocol.mine(LOCKING_TIMELOCK, await lockingProtocol.wallet.getAddress());
    await lockingProtocol.check_balance();
    await lockingProtocol.locking();
    await lockingProtocol.check_balance();
    await lockingProtocol.withdrawTimelock();
  }

  // withdraw early
  {
    await lockingProtocol.mine(LOCKING_TIMELOCK, await lockingProtocol.wallet.getAddress());
    await lockingProtocol.check_balance();
    await lockingProtocol.locking();
    await lockingProtocol.check_balance();
    await lockingProtocol.withdrawEarly();
  }
}

run().then(() => {
  console.log("Done");
  process.exit()
});
