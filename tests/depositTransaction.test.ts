// Import necessary libraries
import { networks } from "bitcoinjs-lib";
import { buildDepositScript, depositTransaction } from "../src/covenantV1/bridge";
import WalletUtils from "./helper/walletUtils";
import { PsbtTransactionResult } from "../lib/covenantV1/types/transaction";
import { getDepositTxInputUTXOsAndFees } from "../src/covenantV1/utils/fee";
import { inputValueSum } from "../lib/covenantV1/utils/fee";
// Set the test timeout for long-running tests
// jest.setTimeout(30000);

const regtestWalletUtils = new WalletUtils(networks.regtest);

const network = networks.regtest;

// Define this function outside the describe block to be reusable
const validateCommonFields = (
  psbtResult: PsbtTransactionResult,
  amount: number,
  estimatedFee: number,
  changeAddress: string
) => {
  expect(psbtResult).toBeDefined();
  const { psbt, fee } = psbtResult;

  // Validate transaction fees
  expect(fee).toBeCloseTo(estimatedFee, 2); // Allowing a small margin for error

  // Validate UTXO and output balances
  const inputAmount = psbt.data.inputs.reduce(
    (sum, input) => sum + input.witnessUtxo!.value,
    0
  );
  const outputAmount = psbt.txOutputs.reduce(
    (sum, output) => sum + output.value,
    0
  );
  expect(inputAmount).toBeGreaterThanOrEqual(outputAmount + fee);

  // Validate change amount and address correctness
  if (inputAmount > (amount + fee)) {
    const expectedChange = inputAmount - (amount + fee);
    const changeOutput = psbt.txOutputs.find((output) => output.address === changeAddress);
    expect(changeOutput).toBeDefined();
    expect(changeOutput!.value).toBeCloseTo(expectedChange, 2);
  }
};


describe("depositTransaction", () => {
  const posKey = "d6ce14162f3954bac0fff55a12b6df7d614801f358b5d910fe7986a47102e65712";
  const ownerEvmAddress = "0x2915fd8beebdc822887deceac3dfe1540fac9c81";
  const evmAddressBuffer = Buffer.from(ownerEvmAddress.slice(2), "hex");
  const posPubkeyBuffer = Buffer.from(posKey, "hex");
  const depositScript = buildDepositScript(evmAddressBuffer, posPubkeyBuffer);
  const feeRate = 15; // Satoshi per byte

  it("should create a valid deposit transaction", async () => {
    const amount = 5e7; // 0.5 BTC in Satoshis
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(amount + 5e6);

    // Build PSBT
    const { psbt, fee } = depositTransaction(
      { depositScript },
      amount,
      changeAddress,
      inputUTXOs,
      network,
      feeRate
    );

    const { fee: estimatedFee } = getDepositTxInputUTXOsAndFees(inputUTXOs, amount, feeRate, 2);

    // Perform detailed validations
    validateCommonFields({ psbt, fee }, amount, estimatedFee, changeAddress);
  });

  it("should throw an error if UTXOs are insufficient", async () => {
    const amount = 5e7; // 0.5 BTC in Satoshis
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(amount - 1e7); // Not enough to cover the transaction + fee

    expect(() => depositTransaction(

      { depositScript },
      amount,
      changeAddress,
      inputUTXOs,
      network,
      feeRate
    )).toThrow("Insufficient funds: unable to gather enough UTXOs to cover the deposit amount and fees.");
  });

  it("should throw an error if the transaction amount is zero or negative", async () => {
    const amount = 0; // Invalid amount
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(1e7); // Enough for fees but invalid amount

    expect(() => depositTransaction(
      { depositScript },
      amount,
      changeAddress,
      inputUTXOs,
      network,
      feeRate
    )).toThrow("Amount and fee rate must be bigger than 0");
  });

  it("should throw an error if the fee rate is zero", async () => {
    const amount = 1e7;
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(amount + 1e6);
    const zeroFeeRate = 0; // Invalid fee rate

    expect(() => depositTransaction(
      { depositScript },
      amount,
      changeAddress,
      inputUTXOs,
      network,
      zeroFeeRate
    )).toThrow("Amount and fee rate must be bigger than 0");
  });

  it("should correctly calculate change", async () => {
    const amount = 5e7; // 0.5 BTC in Satoshis
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(amount + 1e7); // More than needed to cover fees and amount

    const { psbt, fee } = depositTransaction(
      { depositScript },
      amount,
      changeAddress,
      inputUTXOs,
      network,
      feeRate
    );

    const expectedChange = inputValueSum(inputUTXOs) - (amount + fee);
    const changeOutput = psbt.txOutputs.find(output => output.address === changeAddress);
    expect(changeOutput).toBeDefined();
    expect(changeOutput!.value).toBeCloseTo(expectedChange, 2);
  });
});

