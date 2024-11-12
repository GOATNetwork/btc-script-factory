/* eslint-disable max-len */
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { initEccLib, networks, payments, Psbt, Transaction, script as bitcoinScript } from "bitcoinjs-lib";
import { BitcoinCoreWallet } from "walletprovider-ts/lib/providers/bitcoin_core_wallet";
import { buildDefaultBitcoinCoreWallet } from "./wallet.setting"
import { buildPreDepositLockingScript } from "../src/covenantV1/locking.script";
import { lockingTransaction, withdrawalTimeLockTransaction } from "../src/covenantV1/locking";
import { witnessStackToScriptWitness } from "bitcoinjs-lib/src/psbt/psbtutils";

const network = networks.regtest;
initEccLib(ecc);

const LOCKING_HEIGHT = 20;
const NUM_TRANSACTIONS = 1; // Number of transactions to lock

// const txHex = "";

class LockingProtocol {
  wallet: BitcoinCoreWallet;
  lockingTxs: Transaction[]; // Store multiple locking transactions
  scripts: any;
  targetWithdrawAddress: string; // Unified withdrawal address

  constructor() {
    this.wallet = buildDefaultBitcoinCoreWallet();
    this.lockingTxs = [
    //   Transaction.fromHex(txHex)
    ];
    this.scripts = {};
    this.targetWithdrawAddress = ""; // TODO: Set unified withdrawal address
  }

  async getCurrentBlockHeight(): Promise<number> {
    // Get current block height
    const blockCount = await this.wallet.getBTCTipHeight();
    console.log("Current block height:", blockCount);
    return blockCount;
  }

  async batchLocking() {
    console.log("Batch locking transactions...");

    // 1. Get current height and calculate target lock height
    const currentHeight = await this.getCurrentBlockHeight();
    const targetLockHeight = currentHeight + LOCKING_HEIGHT;
    console.log(`Target lock height: ${targetLockHeight}`);

    // 2. Create multiple locking transactions
    for (let i = 0; i < NUM_TRANSACTIONS; i++) {
      try {
        // Get wallet public key
        const walletAddress = await this.wallet.getAddress();
        const pubKey = await this.wallet.getPublicKey(walletAddress);
        const lockerPk = Buffer.from(pubKey, "hex").subarray(0, 33);

        // Create locking script
        const lockingScript = buildPreDepositLockingScript(
          lockerPk,
          targetLockHeight
        );
        this.scripts = { lockingScript };

        // Build locking transaction
        const amount = 1e6; // 0.01 BTC
        const feeRate = 15;
        const changeAddress = await this.wallet.getAddress();
        const inputUTXOs = await this.wallet.getUtxos(changeAddress, amount + 5e6);

        console.log(`Creating locking tx ${i + 1}/${NUM_TRANSACTIONS}`);

        const { psbt } = lockingTransaction(
          this.scripts,
          amount,
          changeAddress,
          inputUTXOs,
          network,
          feeRate,
          undefined,
          undefined
        );

        // Sign transaction
        const signedPsbtHex = await this.wallet.signPsbt(psbt.toHex());
        const signedPsbt = Psbt.fromHex(signedPsbtHex);
        const tx = signedPsbt.extractTransaction();

        console.log(`tx: ${tx.toHex()}`);
        // Broadcast transaction
        const txid = await this.wallet.pushTx(tx.toHex());
        console.log(`Locking transaction ${i + 1} broadcast: ${txid}`);

        // Save transaction info
        this.lockingTxs.push(tx);
      } catch (error) {
        console.error(`Failed to create locking transaction ${i + 1}:`, error);
        throw error;
      }
    }

    console.log(`Successfully created ${this.lockingTxs.length} locking transactions`);
  }

  async mineToTargetHeight() {
    await this.wallet.mine(LOCKING_HEIGHT, await this.wallet.getAddress());
    const currentHeight = await this.getCurrentBlockHeight();
    console.log(`Mining to target height: ${currentHeight + LOCKING_HEIGHT}`);
  }

  async rebuildLockingScript(tx: Transaction, targetLockHeight: number): Promise<Buffer> {
    // Get wallet public key
    const walletAddress = await this.wallet.getAddress();
    const pubKey = await this.wallet.getPublicKey(walletAddress);
    const lockerPk = Buffer.from(pubKey, "hex").subarray(0, 33);

    // Rebuild script with specified lock height
    const lockingScript = buildPreDepositLockingScript(
      lockerPk,
      targetLockHeight
    );

    // Verify script matches
    const outputScript = tx.outs[0].script;
    const p2wshCheck = payments.p2wsh({
      redeem: { output: lockingScript, network },
      network
    });

    if (!p2wshCheck.output?.equals(outputScript)) {
      throw new Error("Rebuilt script does not match transaction output");
    }

    return lockingScript;
  }

  async batchWithdraw() {
    console.log("Batch withdrawing all locked transactions...");

    // Get current height
    const currentHeight = await this.getCurrentBlockHeight();
    console.log("Current block height:", currentHeight);

    // Get unified withdrawal address
    const withdrawalAddress = await this.wallet.getAddress();
    console.log("Withdrawal address:", withdrawalAddress);

    // Process all locked transactions
    for (let i = 0; i < this.lockingTxs.length; i++) {
      try {
        const lockingTx = this.lockingTxs[i];
        console.log(`Processing withdrawal ${i + 1}/${this.lockingTxs.length}`);
        console.log(`Locking txid: ${lockingTx.getId()}`);

        // Build withdrawal transaction
        const feeRate = 15;
        const outputIndex = 0;

        const { psbt } = withdrawalTimeLockTransaction(
          this.scripts,
          lockingTx,
          withdrawalAddress,
          feeRate,
          network,
          outputIndex,
          0,
          currentHeight
        );

        // Set nLocktime
        psbt.setLocktime(currentHeight);

        // Sign transaction
        const lockrKeyPair = await this.wallet.dumpPrivKey();
        psbt.signInput(0, lockrKeyPair);

        // Finalize transaction
        psbt.finalizeInput(0, (
          inputIndex: number,
          input: any,
          script: Buffer) => {
            const payment = payments.p2wsh({
              network,
              redeem: {
                network,
                input: bitcoinScript.compile([
                  input.partialSig![0].signature
                ]),
                output: script
              }
            });

            return {
              finalScriptSig: Buffer.from(""),
              finalScriptWitness: witnessStackToScriptWitness(payment.witness!)
            };
        });

        // Extract and broadcast transaction
        const tx = psbt.extractTransaction();
        const txHex = tx.toHex();
        const txid = await this.wallet.pushTx(txHex);

        console.log(`Withdrawal transaction ${i + 1} broadcast: ${txid}`);
      } catch (error) {
        console.error(`Failed to withdraw transaction ${i + 1}:`, error);
        throw error;
      }
    }

    console.log(`Successfully processed ${this.lockingTxs.length} withdrawals`);
  }

  async check_balance() {
    console.log("Wallet balance: ", await this.wallet.getBalance());
  }

  async getHeight() {
    const height = await this.wallet.getBTCTipHeight();
    console.log("Current height: ", height);
  }

  async getLockHeightFromTx(tx: Transaction): Promise<number> {
    // Get P2WSH output
    const outputScript = tx.outs[0].script;
    const p2wsh = payments.p2wsh({ output: outputScript, network });
    console.log("Lock address:", p2wsh.address);

    // If transaction is unspent, rebuild locking script
    const walletAddress = await this.wallet.getAddress();
    const pubKey = await this.wallet.getPublicKey(walletAddress);
    const lockerPk = Buffer.from(pubKey, "hex").subarray(0, 33);

    // Current height + 20 is the lock height
    const currentHeight = await this.getCurrentBlockHeight();
    const expectedLockHeight = currentHeight + 20;

    const lockingScript = buildPreDepositLockingScript(
      lockerPk,
      expectedLockHeight
    );

    // Verify rebuilt script matches
    const p2wshCheck = payments.p2wsh({
      redeem: { output: lockingScript, network },
      network
    });

    if (p2wshCheck.output?.equals(outputScript)) {
      console.log("Successfully reconstructed locking script");
      return expectedLockHeight;
    }

    throw new Error("Could not determine lock height");
  }
}

async function run() {
  const lockingProtocol = new LockingProtocol();
  await lockingProtocol.wallet.walletPassphrase("btcstaker", 1000);

  await lockingProtocol.getHeight();
  await lockingProtocol.check_balance();

  // 1. Batch create locking transactions
  await lockingProtocol.batchLocking();
  await lockingProtocol.getHeight();
  await lockingProtocol.check_balance();

  // 2. Mine to target height
  await lockingProtocol.mineToTargetHeight();

  // 3. Batch withdraw all transactions to unified address
  await lockingProtocol.batchWithdraw();
  await lockingProtocol.check_balance();
}

run().then(() => {
  console.log("Done");
  process.exit();
});
