import { BIP32Interface } from "bip32";
import * as ecc from "tiny-secp256k1";
import { initEccLib, networks, opcodes, payments, Psbt, script as bitcoinScript, Transaction } from "bitcoinjs-lib";
import { BitcoinCoreWallet } from "walletprovider-ts/lib/providers/bitcoin_core_wallet";
import { mnemonicArray, deriveKey, buildDefaultBitcoinCoreWallet } from "./wallet.setting"
import { buildStakingScript } from "../src/covenantV1/staking.script";
import { stakingTransaction, withdrawalTimeLockTransaction, withdrawalUnbondingTransaction } from "../src/covenantV1/staking";
import { PsbtInput } from "bip174/src/lib/interfaces";
import { witnessStackToScriptWitness } from "bitcoinjs-lib/src/psbt/psbtutils";
const network = networks.regtest;

initEccLib(ecc);

const STAKING_TIMELOCK = 60;

async function initAccount(numCovenants: number): Promise<BIP32Interface[]> {
  let accounts = new Array(numCovenants);
  // staker, covenants...covenants+numConv
  for (let i = 0; i < accounts.length; i++) {
    accounts[i] = await deriveKey(mnemonicArray[i], network);
  }
  return accounts;
}

class StakingProtocol {
  covenants: any[]
  wallet: BitcoinCoreWallet
  stakingTx: Transaction
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
    this.wallet = buildDefaultBitcoinCoreWallet(); // staker
    this.stakingTx = new Transaction;
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

  async getStakerPk() {
    await this.wallet.walletPassphrase("btcstaker", 1000);

    let stakerAddress = await this.wallet.getAddress();
    let pubKey = await this.wallet.getPublicKey(stakerAddress);
    let stakerPk = Buffer.from(pubKey, "hex").subarray(0, 33);
    return stakerPk;
  }

  async staking() {
    console.log("staking");
    const lockHeight = 5;
    console.log("lockHeight: ", lockHeight);
    // const stakerPk = await this.getStakerPk();
    const keyPair = await this.wallet.dumpPrivKey();

    const stakingScript = buildStakingScript(
      this.ownerEvmAddress.startsWith("0x") ?
        Buffer.from(this.ownerEvmAddress.slice(2), "hex") :
        Buffer.from(this.ownerEvmAddress, "hex"),
      keyPair.publicKey,
      this.validatorKey,
      lockHeight,
      this.validatorIndex,
      this.nonce
    );

    this.scripts = { stakingScript };

    const amount = 1e6; // 0.01 BTC
    const feeRate = 15;
    const changeAddress = await this.wallet.getAddress();
    const inputUTXOs = await this.wallet.getUtxos(changeAddress, amount + 5e7);
    console.log("inputUTXOs: ", inputUTXOs.length)

    const { psbt } = stakingTransaction(
      this.scripts,
      amount,
      changeAddress,
      inputUTXOs,
      network,
      feeRate,
      lockHeight
    )

    const signedStakingPsbtHex = await this.wallet.signPsbt(psbt.toHex());

    const signedStakingPsbt = Psbt.fromHex(signedStakingPsbtHex);

    const txHex = signedStakingPsbt.extractTransaction().toHex();

    console.log(`txHex: ${txHex}`);

    await this.mine(10, await this.wallet.getAddress());

    const receipt = await this.wallet.pushTx(txHex);

    console.log(`txid: ${receipt}`)

    this.stakingTx = Transaction.fromHex(txHex);
  }

  async withdrawTimelock() {
    console.log("withdrawTimelock");
    await this.mine(20, await this.wallet.getAddress());

    const withdrawalAddress = await this.wallet.getAddress();
    const minimumFee = 1000;
    const outputIndex = 0;

    const { psbt } = withdrawalTimeLockTransaction(
      this.scripts,
      this.stakingTx,
      withdrawalAddress,
      minimumFee,
      network,
      outputIndex
    );

    const stakerKeyPair = await this.wallet.dumpPrivKey();

    psbt.signInput(0, stakerKeyPair);

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
    const transactionFee = 1000;
    const outputIndex = 0;

    const { psbt } = withdrawalUnbondingTransaction(
      this.scripts,
      this.stakingTx,
      withdrawalAddress,
      transactionFee,
      network,
      outputIndex
    );

    const combineBytes = Buffer.concat([
      this.validatorIndex,
      this.nonce
    ])

    const stakerKeyPair = await this.wallet.dumpPrivKey();

    psbt.signInput(0, stakerKeyPair);
    psbt.signInput(0, this.validator);


    psbt.finalizeInput(0, (
      inputIndex: number,
      input: PsbtInput,
      script: Buffer) => {
      console.log("Partial Signatures:");
      console.log(`\tStaker: ${input.partialSig![0].signature.toString("hex")}`);
      console.log(`\tValidator: ${input.partialSig![1].signature.toString("hex")}`);

      console.log("Public Keys:");
      console.log(`\tStaker: ${input.partialSig![0].pubkey.toString("hex")}`);
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
    // console.log("Staker balance: ", await this.wallet.getUtxos(await this.wallet.getAddress()));
  }

  async mine(bn: number, addr: string) {
    await this.wallet.mine(bn, addr);
    // console.log("Staker balance: ", await this.wallet.getUtxos(await this.wallet.getAddress()));
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
  let stakingProtocol = new StakingProtocol(accounts);

  await stakingProtocol.check_balance();
  // send token to staker
  // await stakingProtocol.fuel(await getAddress(stakingProtocol.covenants[0]));
  // await stakingProtocol.fuel(await getAddress(stakingProtocol.covenants[1]));
  // await stakingProtocol.fuel(await getAddress(stakingProtocol.covenants[2]));

  await stakingProtocol.check_balance();

  await stakingProtocol.wallet.walletPassphrase("btcstaker", 1000);


  // withdraw timelock
  {
    await stakingProtocol.mine(STAKING_TIMELOCK, await stakingProtocol.wallet.getAddress());
    await stakingProtocol.check_balance();
    await stakingProtocol.staking();
    await stakingProtocol.check_balance();
    await stakingProtocol.withdrawTimelock();
  }

  // withdraw early
  {
    await stakingProtocol.mine(STAKING_TIMELOCK, await stakingProtocol.wallet.getAddress());
    await stakingProtocol.check_balance();
    await stakingProtocol.staking();
    await stakingProtocol.check_balance();
    await stakingProtocol.withdrawEarly();
  }
}

run().then(() => {
  console.log("Done");
  process.exit()
});
