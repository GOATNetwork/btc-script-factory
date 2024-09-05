// Import necessary libraries
import { networks } from "bitcoinjs-lib";
import { buildDataEmbedScript, parseDataEmbedScript, depositToFixedAddressTransaction } from "../src/covenantV1/bridge";
import WalletUtils from "./helper/walletUtils";
import { PsbtTransactionResult } from "../src/types/transaction";
import { inputValueSum } from "../src/utils/fee";
import { getSpendTxInputUTXOsAndFees } from "../src/utils/feeV1";
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

describe("depositToFixedAddressTransaction Tests", () => {
  const magicBytes = Buffer.from("47545430", "hex");
  const evmAddress = Buffer.from("2915fd8beebdc822887deceac3dfe1540fac9c81", "hex");
  const dataEmbedScript = buildDataEmbedScript(magicBytes, evmAddress);
  const fixedAddress = "bcrt1q25p75p3vv54cpk4cgmt5j3f8zs55lp6as3nyth";
  const feeRate = 15; // Satoshi per byte

  it("should create a valid deposit transaction with data embedding", async () => {
    const amount = 5e7; // 0.5 BTC in Satoshis
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(amount + 5e6);

    // Build PSBT
    const { psbt, fee } = depositToFixedAddressTransaction(
      { dataEmbedScript },
      amount,
      fixedAddress,
      changeAddress,
      inputUTXOs,
      network,
      feeRate
    );

    const psbtOutputs = [{
      address: fixedAddress,
      value: amount
    }, {
      script: dataEmbedScript,
      value: 0
    }];

    const { fee: estimatedFee } = getSpendTxInputUTXOsAndFees(network, inputUTXOs, amount, feeRate, psbtOutputs);

    // Perform detailed validations
    validateCommonFields({ psbt, fee }, amount, estimatedFee, changeAddress);
  });

  it("should parse the data embedding script correctly", () => {
    const parsedData = parseDataEmbedScript(dataEmbedScript);
    expect(parsedData.magicBytes).toEqual(magicBytes);
    expect(parsedData.evmAddress).toEqual(evmAddress);
  });

  it("should throw an error if UTXOs are insufficient", async () => {
    const amount = 5e7; // 0.5 BTC in Satoshis
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(amount - 1e7); // Not enough to cover the transaction + fee

    expect(() => depositToFixedAddressTransaction(

      { dataEmbedScript },
      amount,
      fixedAddress,
      changeAddress,
      inputUTXOs,
      network,
      feeRate
    )).toThrow("Insufficient funds: unable to gather enough UTXOs to cover the spend amount and fees");
  });

  it("should throw an error if the transaction amount is zero or negative", async () => {
    const amount = 0; // Invalid amount
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(1e7); // Enough for fees but invalid amount

    expect(() => depositToFixedAddressTransaction(

      { dataEmbedScript },
      amount,
      fixedAddress,
      changeAddress,
      inputUTXOs,
      network,
      feeRate
    )).toThrow("Amount and fee rate must be non-negative integers greater than 0");
  });

  it("should throw an error if the fee rate is zero", async () => {
    const amount = 1e7;
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(amount + 1e6);
    const zeroFeeRate = 0; // Invalid fee rate

    expect(() => depositToFixedAddressTransaction(

      { dataEmbedScript },
      amount,
      fixedAddress,
      changeAddress,
      inputUTXOs,
      network,
      zeroFeeRate
    )).toThrow("Amount and fee rate must be non-negative integers greater than 0");
  });

  it("should throw an error if the fee rate is negative", async () => {
    const amount = 1e7;
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(amount + 1e6);
    const negativeFeeRate = -1; // Invalid fee rate

    expect(() => depositToFixedAddressTransaction(

      { dataEmbedScript },
      amount,
      fixedAddress,
      changeAddress,
      inputUTXOs,
      network,
      negativeFeeRate
    )).toThrow("Amount and fee rate must be non-negative integers greater than 0");
  });

  it("should throw an error if the fee rate is not an integer", async () => {
    const amount = 1e7;
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(amount + 1e6);
    const decimalFeeRate = 1.1; // Invalid fee rate

    expect(() => depositToFixedAddressTransaction(

      { dataEmbedScript },
      amount,
      fixedAddress,
      changeAddress,
      inputUTXOs,
      network,
      decimalFeeRate
    )).toThrow("Amount and fee rate must be non-negative integers greater than 0");
  });

  it("should correctly calculate change", async () => {
    const amount = 5e7; // 0.5 BTC in Satoshis
    const changeAddress = await regtestWalletUtils.getAddress();
    const inputUTXOs = await regtestWalletUtils.getUtxos(amount + 1e7); // More than needed to cover fees and amount

    const { psbt, fee } = depositToFixedAddressTransaction(
      { dataEmbedScript },
      amount,
      fixedAddress,
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
