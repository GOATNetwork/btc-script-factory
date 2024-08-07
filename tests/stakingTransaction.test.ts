// Import necessary libraries and functions
import { networks, Transaction } from "bitcoinjs-lib";
import { stakingTransaction, withdrawalTimeLockTransaction, withdrawalUnbondingTransaction } from "../src/covenantV1/staking";
import WalletUtils from "./helper/walletUtils";
import { buildStakingScript } from "../src/covenantV1/staking.script"; // Assuming this exists for fetching addresses and UTXOs

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
const stakingScript = buildStakingScript(
  evmAddressBuffer,
  delegatorPubkeyBuffer,
  validatorPubkeyBuffer,
  lockBlockNumber,
  validatorNodeIndex,
  nonce
)

describe("stakingTransaction", () => {
  it("should create a valid staking transaction with valid inputs", async () => {
    const amount = 1e7; // Example amount in Satoshis
    const changeAddress = await walletUtils.getAddress();
    const inputUTXOs = await walletUtils.getUtxos(amount + 1e6);
    const feeRate = 10; // Satoshi per byte

    const result = stakingTransaction(
      { stakingScript },
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

    expect(() => stakingTransaction(
      { stakingScript },
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

    const result = stakingTransaction(
      { stakingScript },
      amount,
      changeAddress,
      inputUTXOs,
      regtest,
      feeRate,
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

    expect(() => stakingTransaction(
      { stakingScript },
      amount,
      changeAddress,
      inputUTXOs,
      regtest,
      feeRate,
      invalidLockHeight
    )).toThrow("Invalid lock height");
  });
});

describe("withdrawalTimeLockTransaction", () => {
  it("should create a valid timelocked withdrawal transaction", async () => {
    const minimumFee = 1000; // Example fee in Satoshis
    const withdrawalAddress = await walletUtils.getAddress();
    const mockStakingTransaction = new Transaction(); // Mock a transaction for testing
    mockStakingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 1e7);

    const result = withdrawalTimeLockTransaction(
      { stakingScript },
      mockStakingTransaction,
      withdrawalAddress,
      minimumFee,
      regtest
    );

    expect(result.psbt).toBeDefined();
    expect(result.psbt.txOutputs[0].value).toBe(1e7 - minimumFee);
    // Ensure sequence is set for timelock
    expect(result.psbt.txInputs[0].sequence).toBeGreaterThan(0);
  });

  it("should throw an error if the minimum fee is zero", async () => {
    const minimumFee = 0;
    const withdrawalAddress = await walletUtils.getAddress();
    const mockStakingTransaction = new Transaction();
    mockStakingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 1e7);

    expect(() => withdrawalTimeLockTransaction(
      { stakingScript },
      mockStakingTransaction,
      withdrawalAddress,
      minimumFee,
      regtest
    )).toThrow("Minimum fee must be bigger than 0");
  });

  it("should validate the timelock script", async () => {
    const minimumFee = 1000;
    const withdrawalAddress = await walletUtils.getAddress();
    const mockStakingTransaction = new Transaction();
    mockStakingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 1e7);

    // Provide an incorrect script for testing error handling
    const incorrectScript = Buffer.from("incorrect_script", "hex");

    expect(() => withdrawalTimeLockTransaction(
      { stakingScript: incorrectScript },
      mockStakingTransaction,
      withdrawalAddress,
      minimumFee,
      regtest
    )).toThrow("Timelock script is not valid");
  });
});

describe("withdrawalUnbondingTransaction", () => {
  it("should process an unbonding transaction correctly", async () => {
    const transactionFee = 1500; // Example transaction fee in Satoshis
    const withdrawalAddress = await walletUtils.getAddress();
    const mockStakingTransaction = new Transaction();
    mockStakingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 2e7);

    const result = withdrawalUnbondingTransaction(
      { stakingScript },
      mockStakingTransaction,
      withdrawalAddress,
      transactionFee,
      regtest
    );

    expect(result.psbt).toBeDefined();
    expect(result.psbt.txOutputs[0].value).toBe(2e7 - transactionFee);
  });

  it("should throw an error if transaction fee is zero", async () => {
    const transactionFee = 0;
    const withdrawalAddress = await walletUtils.getAddress();
    const mockStakingTransaction = new Transaction();
    mockStakingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 1e7);

    expect(() => withdrawalUnbondingTransaction(
      { stakingScript },
      mockStakingTransaction,
      withdrawalAddress,
      transactionFee,
      regtest
    )).toThrow("Unbonding fee must be bigger than 0");
  });

  it("should throw an error for an invalid output index", async () => {
    const transactionFee = 1000;
    const withdrawalAddress = await walletUtils.getAddress();
    const mockStakingTransaction = new Transaction();
    mockStakingTransaction.addOutput(Buffer.from(withdrawalAddress, "hex"), 1e7);

    // Provide an invalid output index
    const invalidOutputIndex = -1;

    expect(() => withdrawalUnbondingTransaction(
      { stakingScript },
      mockStakingTransaction,
      withdrawalAddress,
      transactionFee,
      regtest,
      invalidOutputIndex
    )).toThrow("Output index must be bigger or equal to 0");
  });
});
