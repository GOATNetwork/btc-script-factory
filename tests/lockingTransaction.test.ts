// Import necessary libraries and functions
import { networks, Transaction } from "bitcoinjs-lib";
import { lockingTransaction, withdrawalTimeLockTransaction, withdrawalUnbondingTransaction } from "../src/covenantV1/locking";
import WalletUtils from "./helper/walletUtils";
import { buildLockingScript } from "../src/covenantV1/locking.script";
import { getWithdrawTxFee } from "../src/utils/feeV1"; // Assuming this exists for fetching addresses and UTXOs

// Set up a test network environment
const regtest = networks.regtest;
const walletUtils = new WalletUtils(regtest);

const delegatorKey = "023d02b47df037a43cb4354c72f162da99f5bd558209ca851816ca9170fe291da7";
const ownerEvmAddress = "0x2915fd8beebdc822887deceac3dfe1540fac9c81";
const validatorKey = "031944507b30d7a911d12532732e4877ed41b9f05fe2242df22e045436354a077b";
const validatorNodeIndex = Buffer.from("ef921bb0", "hex");
const nonce = Buffer.from("537d5579", "hex");
const lockBlockNumber = 0x02;

const evmAddressBuffer = ownerEvmAddress.startsWith("0x") ?
  Buffer.from(ownerEvmAddress.slice(2), "hex") :
  Buffer.from(ownerEvmAddress, "hex");
const delegatorPubkeyBuffer = Buffer.from(delegatorKey, "hex");
const validatorPubkeyBuffer = Buffer.from(validatorKey, "hex");

// Common data for tests
const lockingScript = buildLockingScript(
  evmAddressBuffer,
  delegatorPubkeyBuffer,
  validatorPubkeyBuffer,
  lockBlockNumber,
  validatorNodeIndex,
  nonce
)

describe("lockingTransaction", () => {
  it("should create a valid locking transaction with valid inputs", async () => {
    const amount = 1e7; // Example amount in Satoshis
    const changeAddress = await walletUtils.getAddress();
    const inputUTXOs = await walletUtils.getUtxos(amount + 1e6);
    const feeRate = 10; // Satoshi per byte

    const result = lockingTransaction(
      { lockingScript },
      amount,
      changeAddress,
      inputUTXOs,
      regtest,
      feeRate
    );

    expect(result.psbt).toBeDefined();
    expect(result.fee).toBeGreaterThan(0);
    // More assertions can be added here to verify specifics about the PSBT
  });

  it("should throw an error if the amount or fee rate is zero", async () => {
    const amount = 0;
    const changeAddress = await walletUtils.getAddress();
    const inputUTXOs = await walletUtils.getUtxos(1e6);
    const feeRate = 0; // Invalid fee rate

    expect(() => lockingTransaction(
      { lockingScript },
      amount,
      changeAddress,
      inputUTXOs,
      regtest,
      feeRate
    )).toThrow("Amount and fee rate must be bigger than 0");
  });

  it("should handle lockHeight correctly", async () => {
    const amount = 1e7;
    const changeAddress = await walletUtils.getAddress();
    const inputUTXOs = await walletUtils.getUtxos(amount + 1e6);
    const feeRate = 10;
    const lockHeight = 400000; // Valid lock height

    const result = lockingTransaction(
      { lockingScript },
      amount,
      changeAddress,
      inputUTXOs,
      regtest,
      feeRate,
        undefined,
      lockHeight
    );

    expect(result.psbt.txInputs[0].sequence).not.toBe(0xfffffffe); // Assuming locktime was handled
  });

  it("should throw an error for invalid lock height", async () => {
    const amount = 1e7;
    const changeAddress = await walletUtils.getAddress();
    const inputUTXOs = await walletUtils.getUtxos(amount + 1e6);
    const feeRate = 10;
    const invalidLockHeight = 500000001; // Above cutoff

    expect(() => lockingTransaction(
      { lockingScript },
      amount,
      changeAddress,
      inputUTXOs,
      regtest,
      feeRate,
        undefined,
      invalidLockHeight
    )).toThrow("Invalid lock height");
  });
});

describe("withdrawalTimeLockTransaction", () => {
  it("should create a valid timelocked withdrawal transaction", async () => {
    const feeRate = 15;
    const outputIndex = 0;
    const withdrawalAddress = await walletUtils.getAddress();
    const mockLockingTransaction = new Transaction(); // Mock a transaction for testing
    mockLockingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 1e7);

    const result = withdrawalTimeLockTransaction(
      { lockingScript },
      mockLockingTransaction,
      withdrawalAddress,
      feeRate,
      regtest,
      outputIndex
    );

    expect(result.psbt).toBeDefined();
    expect(result.psbt.txOutputs[0].value).toBe(1e7 - getWithdrawTxFee(feeRate, mockLockingTransaction.outs[outputIndex].script));
    // Ensure sequence is set for timelock
    expect(result.psbt.txInputs[0].sequence).toBeGreaterThan(0);
  });

  it("should throw an error if the minimum fee is zero", async () => {
    const feeRate = 0;
    const withdrawalAddress = await walletUtils.getAddress();
    const mockLockingTransaction = new Transaction();
    mockLockingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 1e7);

    expect(() => withdrawalTimeLockTransaction(
      { lockingScript },
      mockLockingTransaction,
      withdrawalAddress,
      feeRate,
      regtest
    )).toThrow("fee rate must be bigger than 0");
  });

  it("should validate the timelock script", async () => {
    const feeRate = 15;
    const withdrawalAddress = await walletUtils.getAddress();
    const mockLockingTransaction = new Transaction();
    mockLockingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 1e7);

    // Provide an incorrect script for testing error handling
    const incorrectScript = Buffer.from("incorrect_script", "hex");

    expect(() => withdrawalTimeLockTransaction(
      { lockingScript: incorrectScript },
      mockLockingTransaction,
      withdrawalAddress,
      feeRate,
      regtest
    )).toThrow("Timelock script is not valid");
  });
});

describe("withdrawalUnbondingTransaction", () => {
  it("should process an unbonding transaction correctly", async () => {
    const feeRate = 15;
    const outputIndex = 0;
    const withdrawalAddress = await walletUtils.getAddress();
    const mockLockingTransaction = new Transaction();
    mockLockingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 2e7);

    const result = withdrawalUnbondingTransaction(
      { lockingScript },
      mockLockingTransaction,
      withdrawalAddress,
      feeRate,
      regtest,
      outputIndex
    );

    expect(result.psbt).toBeDefined();
    expect(result.psbt.txOutputs[0].value).toBe(2e7 - getWithdrawTxFee(feeRate, mockLockingTransaction.outs[outputIndex].script));
  });

  it("should throw an error if transaction fee is zero", async () => {
    const feeRate = 0;
    const withdrawalAddress = await walletUtils.getAddress();
    const mockLockingTransaction = new Transaction();
    mockLockingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 1e7);

    expect(() => withdrawalUnbondingTransaction(
      { lockingScript },
      mockLockingTransaction,
      withdrawalAddress,
      feeRate,
      regtest
    )).toThrow("fee rate must be bigger than 0");
  });

  it("should throw an error for an invalid output index", async () => {
    const feeRate = 15;
    const withdrawalAddress = await walletUtils.getAddress();
    const mockLockingTransaction = new Transaction();
    mockLockingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 1e7);

    // Provide an invalid output index
    const invalidOutputIndex = -1;

    expect(() => withdrawalUnbondingTransaction(
      { lockingScript },
      mockLockingTransaction,
      withdrawalAddress,
      feeRate,
      regtest,
      invalidOutputIndex
    )).toThrow("Output index must be bigger or equal to 0");
  });
});
