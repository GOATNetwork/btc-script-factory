import BIP32Factory, { BIP32Interface } from "bip32";
import * as ecc from "tiny-secp256k1";
import { initEccLib, networks, Psbt, Transaction } from "bitcoinjs-lib";
import * as staking from "../src/staking";
import { BitcoinCoreWallet } from "walletprovider-ts/lib/providers/bitcoin_core_wallet";
import { buildDefaultBitcoinCoreWallet } from "./wallet.setting"

import { signPsbtFromBase64 } from "./signpsbt";
import { buildStakingScript } from "../src/covenantV1/utils/staking.script";
import { stakingTransaction, withdrawalTimeLockTransaction, withdrawalUnbondingTransaction } from "../src/covenantV1/staking";

const bip32 = BIP32Factory(ecc);
// import * as assert from 'assert';
const network = networks.regtest;

const bip39 = require("bip39")
// const rng = require("randombytes");

initEccLib(ecc);

const STAKING_TIMELOCK = 20;

const invalidEthAddress = "0x0000000000000000000000000000000000000000";

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

async function initAccount(numCovenants: number): Promise<BIP32Interface[]> {
  let accounts = new Array(numCovenants);
  // staker, covenants...covenants+numConv
  for (let i = 0; i < accounts.length; i++) {
    accounts[i] = await deriveKey(mnemonicArray[i]);
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
  validatorIndex: number;
  nonce: number;

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
    this.validatorIndex = 0xef921bb0;
    this.nonce = 0x537d5579;
  }

  async getStakerPk() {
    let stakerAddress = await this.wallet.getAddress();
    let pubKey = await this.wallet.getPublicKey(stakerAddress);
    let stakerPk = Buffer.from(pubKey, "hex").subarray(0, 33);
    return stakerPk;
  }

  async staking() {
    console.log("staking");
    const lockHeight = await this.wallet.getBTCTipHeight() + 10;
    const stakerPk = await this.getStakerPk();

    const stakingScript = buildStakingScript(
      this.ownerEvmAddress.startsWith("0x") ?
        Buffer.from(this.ownerEvmAddress.slice(2), "hex") :
        Buffer.from(this.ownerEvmAddress, "hex"),
      stakerPk,
      this.validatorKey,
      lockHeight,
      this.validatorIndex,
      this.nonce
    );

    this.scripts = { stakingScript };

    const amount = 5e6; // 0.05 BTC
    const feeRate = 15;
    const changeAddress = await this.wallet.getAddress();
    const inputUTXOs = await this.wallet.getUtxos(changeAddress, amount);

    const { psbt } = stakingTransaction(
      this.scripts,
      amount,
      changeAddress,
      inputUTXOs,
      network,
      feeRate,
      lockHeight
    )

    await this.wallet.walletPassphrase("btcstaker", 1000);

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

    const txHex = await signPsbtFromBase64(psbt.toBase64(), [await this.wallet.dumpPrivKey()], true);

    // const signedPsbt = Psbt.fromBase64(signedPsbBase64);

    // const tx = signedPsbt.extractTransaction();
    const tx = Transaction.fromHex(txHex);

    tx.setWitness(0, [
      this.ownerEvmAddress.startsWith("0x") ?
        Buffer.from(this.ownerEvmAddress.slice(2), "hex") :
        Buffer.from(this.ownerEvmAddress, "hex")
    ]);

    // const txHex = tx.toHex();

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

    const txHex = await signPsbtFromBase64(psbt.toBase64(), [await this.wallet.dumpPrivKey(), this.validator], true);

    // const signedPsbt = Psbt.fromBase64(signedPsbBase64);

    // const tx = signedPsbt.extractTransaction();
    const tx = Transaction.fromHex(txHex);

    tx.setWitness(0, [
      invalidEthAddress.startsWith("0x") ?
        Buffer.from(invalidEthAddress.slice(2), "hex") :
        Buffer.from(invalidEthAddress, "hex"),
      Buffer.concat([
        Buffer.alloc(4, this.validatorIndex), // Ensure 4 bytes for validatorIndex
        Buffer.alloc(4, this.nonce) // Ensure 4 bytes for nonce
      ])
      // validatorSignature, // todo how to get validatorSignature
    ]);

    // const txHex = tx.toHex();

    const receipt = await this.wallet.pushTx(txHex);
    console.log(`txid: ${receipt}`)
  }

  async slash() {
    await this.mine(20, await this.wallet.getAddress());
    console.log("Slashing");
    let { fastestFee } = await this.wallet.getNetworkFees();
    let stakingOutputIndex = 0;
    let slashingAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
    console.log(`fastestFee ${fastestFee}, slashing address ${slashingAddress}`)
    let slashingRate = 0.5;
    const slashTimelockUnbondedPsbt: { psbt: Psbt } = staking.slashTimelockUnbondedTransaction(
      this.scripts,
      this.stakingTx,
      slashingAddress,
      slashingRate,
      fastestFee || 1000, // feeRate,
      network,
      stakingOutputIndex
    );
    console.log("init account, staker", await this.wallet.getAddress());

    let keyPairs = [
      await this.wallet.dumpPrivKey(),
      this.covenants[0],
      this.covenants[1],
      this.covenants[2]
    ];
    console.log("signPsbt");
    const signedStakingPsbtHex = await signPsbtFromBase64(slashTimelockUnbondedPsbt.psbt.toBase64(), keyPairs, true);

    console.log("pushTx", signedStakingPsbtHex);
    this.check_balance();
    let receipt = await this.wallet.pushTx(signedStakingPsbtHex);
    console.log("txid: ", receipt);
    await this.mine(20, await this.wallet.getAddress());
    this.check_balance();
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

  // withdraw timelock
  {
    await stakingProtocol.mine(STAKING_TIMELOCK, await stakingProtocol.wallet.getAddress());
    await stakingProtocol.check_balance();
    await stakingProtocol.staking();
    await stakingProtocol.check_balance();
    await stakingProtocol.withdrawTimelock();
  }

  // withdraw timelock
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
