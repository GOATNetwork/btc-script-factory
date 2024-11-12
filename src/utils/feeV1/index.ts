import { Network, address, script as bitcoinScript } from "bitcoinjs-lib";
import { BTC_DUST_SAT } from "../../constants";
import {
  LOW_RATE_ESTIMATION_ACCURACY_BUFFER,
  MAX_NON_LEGACY_OUTPUT_SIZE,
  OP_RETURN_OUTPUT_VALUE_SIZE,
  OP_RETURN_VALUE_SERIALIZE_SIZE,
  TX_BUFFER_SIZE_OVERHEAD,
  WALLET_RELAY_FEE_RATE_THRESHOLD,
  WITHDRAW_TX_BUFFER_SIZE
} from "../../constants";
import { UTXO } from "../../types/UTXO";
import {
  PsbtOutputExtended,
  isPsbtOutputExtendedAddress
} from "../../types/psbtOutputs";
import {
  getEstimatedChangeOutputSize,
  getInputSizeByScript,
  isOP_RETURN
} from "./utils";

/**
 * Selects UTXOs and calculates the fee for a spend transaction.
 * This method selects the highest value UTXOs from all available UTXOs to
 * cover the spend amount and the transaction fees.
 * The formula used is:
 *
 * totalFee = (inputSize + outputSize) * feeRate + buffer
 * where outputSize may or may not include the change output size depending on the remaining value.
 *
 * @param {Network} network - The Bitcoin network.
 * @param {UTXO[]} availableUTXOs - All available UTXOs from the wallet.
 * @param {number} spendAmount - The amount to spend.
 * @param {number} feeRate - The fee rate in satoshis per byte.
 * @param {PsbtOutputExtended[]} outputs - The outputs in the transaction.
 * @return {PsbtTransactionResult} An object containing the selected UTXOs and the fee.
 * @throws Will throw an error if there are insufficient funds or if the fee cannot be calculated.
 */
export const getSpendTxInputUTXOsAndFees = (
  network: Network,
  availableUTXOs: UTXO[],
  spendAmount: number,
  feeRate: number,
  outputs: PsbtOutputExtended[]
): {
  selectedUTXOs: UTXO[];
  fee: number;
} => {
  if (availableUTXOs.length === 0) {
    throw new Error("Insufficient funds");
  }
  // Sort available UTXOs from highest to lowest value
  availableUTXOs.sort((a, b) => b.value - a.value);

  const selectedUTXOs: UTXO[] = [];
  let accumulatedValue = 0;
  let estimatedFee;

  for (const utxo of availableUTXOs) {
    selectedUTXOs.push(utxo);
    accumulatedValue += utxo.value;

    // Calculate the fee for the current set of UTXOs and outputs
    const estimatedSize = getEstimatedSize(network, selectedUTXOs, outputs);
    estimatedFee = estimatedSize * feeRate + rateBasedTxBufferFee(feeRate);
    // Check if there will be any change left after the spend amount and fee.
    // If there is, a change output needs to be added, which also comes with an additional fee.
    if (accumulatedValue - (spendAmount + estimatedFee) > BTC_DUST_SAT) {
      estimatedFee += getEstimatedChangeOutputSize() * feeRate;
    }
    if (accumulatedValue >= spendAmount + estimatedFee) {
      break;
    }
  }
  if (!estimatedFee) {
    throw new Error("Unable to calculate fee");
  }

  if (accumulatedValue < spendAmount + estimatedFee) {
    throw new Error(
      "Insufficient funds: unable to gather enough UTXOs to cover the spend amount and fees"
    );
  }

  return {
    selectedUTXOs,
    fee: estimatedFee
  };
};

/**
 * Calculates the spend amount and fee for a transaction given a set of available UTXOs.
 * The method calculates the total available value, estimates the fee based on available UTXOs,
 * and subtracts the fee from the total value to determine the spend amount.
 *
 * @param {Network} network - The Bitcoin network.
 * @param {UTXO[]} availableUTXOs - All available UTXOs from the wallet.
 * @param {number} feeRate - The fee rate in satoshis per byte.
 * @param {PsbtOutputExtended[]} outputs - The outputs in the transaction.
 * @return {Object} An object containing the calculated fee and spendAmount.
 * @throws Will throw an error if the fee cannot be calculated.
 */
export const calculateSpendAmountAndFee = (
  network: Network,
  availableUTXOs: UTXO[],
  feeRate: number,
  outputs: PsbtOutputExtended[]
): {
  fee: number;
  spendAmount: number;
} => {
  if (availableUTXOs.length === 0) {
    throw new Error("No available UTXOs");
  }

  // Sort UTXOs by value in descending order
  availableUTXOs.sort((a, b) => b.value - a.value);

  let accumulatedValue = availableUTXOs.reduce((acc, utxo) => acc + utxo.value, 0);
  let estimatedFee = getEstimatedSize(network, availableUTXOs, outputs) * feeRate;

  // Add additional buffer if there is any change left after spending
  if (accumulatedValue - estimatedFee > BTC_DUST_SAT) {
    estimatedFee += getEstimatedChangeOutputSize() * feeRate;
  }

  if (!estimatedFee) {
    throw new Error("Unable to calculate fee");
  }

  const spendAmount = accumulatedValue - estimatedFee;

  if (spendAmount <= 0) {
    throw new Error("Insufficient funds after calculating fees");
  }

  return {
    fee: estimatedFee,
    spendAmount
  };
};

/**
 * Calculates the estimated fee for a withdrawal transaction.
 * The fee calculation is based on estimated constants for input size,
 * output size, and additional overhead specific to withdrawal transactions.
 * Due to the slightly larger size of withdrawal transactions, an additional
 * buffer is included to account for this difference.
 *
 * @param {number} feeRate - The fee rate in satoshis per vbyte.
 * @param {Buffer} script - The scriptPubKey of the output being spent.
 * @param {Buffer} dataEmbedScript - The script of the data embed output.
 * @return {number} The estimated fee for a withdrawal transaction in satoshis.
 */
export const getWithdrawTxFee = (feeRate: number, script: Buffer, dataEmbedScript?: Buffer): number => {
  const inputSize = getInputSizeByScript(script);
  let outputSize = getEstimatedChangeOutputSize();
  if (dataEmbedScript && isOP_RETURN(dataEmbedScript)) {
    outputSize += dataEmbedScript.length + OP_RETURN_OUTPUT_VALUE_SIZE + OP_RETURN_VALUE_SERIALIZE_SIZE;
  }
  return (
    feeRate *
      (inputSize +
        outputSize +
        TX_BUFFER_SIZE_OVERHEAD +
        WITHDRAW_TX_BUFFER_SIZE) +
    rateBasedTxBufferFee(feeRate)
  );
};

/**
 * Calculates the estimated transaction size using a heuristic formula which
 * includes the input size, output size, and a fixexd buffer for the transaction size.
 * The formula used is:
 *
 * totalSize = inputSize + outputSize + TX_BUFFER_SIZE_OVERHEAD
 *
 * @param {Network} network - The Bitcoin network being used.
 * @param {UTXO[]} inputUtxos - The UTXOs used as inputs in the transaction.
 * @param {PsbtOutputExtended[]} outputs - The outputs in the transaction.
 * @return {number} The estimated transaction size in bytes.
 */
const getEstimatedSize = (
  network: Network,
  inputUtxos: UTXO[],
  outputs: PsbtOutputExtended[]
): number => {
  // Estimate the input size
  const inputSize = inputUtxos.reduce((acc: number, u: UTXO): number => {
    const script = Buffer.from(u.scriptPubKey, "hex");
    const decompiledScript = bitcoinScript.decompile(script);
    if (!decompiledScript) {
      throw new Error(
        "Failed to decompile script when estimating fees for inputs"
      );
    }
    return acc + getInputSizeByScript(script);
  }, 0);

  // Estimate the output size
  const outputSize = outputs.reduce((acc, output): number => {
    const script = isPsbtOutputExtendedAddress(output) ?
      address.toOutputScript(output.address, network) :
      output.script;
    if (isOP_RETURN(script)) {
      return (
        acc +
        script.length +
        OP_RETURN_OUTPUT_VALUE_SIZE +
        OP_RETURN_VALUE_SERIALIZE_SIZE
      );
    }
    return acc + MAX_NON_LEGACY_OUTPUT_SIZE;
  }, 0);

  return inputSize + outputSize + TX_BUFFER_SIZE_OVERHEAD;
};

/**
 * Adds a buffer to the transaction size-based fee calculation if the fee rate is low.
 * Some wallets have a relayer fee requirement, which means if the fee rate is
 * less than or equal to WALLET_RELAY_FEE_RATE_THRESHOLD (2 satoshis per byte),
 * there is a risk that the fee might not be sufficient to get the transaction relayed.
 * To mitigate this risk, we add a buffer to the fee calculation to ensure that
 * the transaction can be relayed.
 *
 * If the fee rate is less than or equal to WALLET_RELAY_FEE_RATE_THRESHOLD, a fixed buffer is added
 * (LOW_RATE_ESTIMATION_ACCURACY_BUFFER). If the fee rate is higher, no buffer is added.
 *
 * @param {number} feeRate - The fee rate in satoshis per byte.
 * @return {number} The buffer amount in satoshis to be added to the transaction fee.
 */
const rateBasedTxBufferFee = (feeRate: number): number => {
  return feeRate <= WALLET_RELAY_FEE_RATE_THRESHOLD ?
    LOW_RATE_ESTIMATION_ACCURACY_BUFFER :
    0;
};
