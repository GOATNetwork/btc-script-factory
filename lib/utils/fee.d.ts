import { UTXO } from "../types/UTXO";
export declare const INPUT_SIZE_FOR_FEE_CAL = 180;
export declare const OUTPUT_SIZE_FOR_FEE_CAL = 34;
export declare const TX_BUFFER_SIZE_FOR_FEE_CAL = 10;
/**
 * Calculates the estimated transaction fee using a heuristic formula.
 *
 * This method estimates the transaction fee based on the formula:
 * `numInputs * 180 + numOutputs * 34 + 10 + numInputs`
 *
 * The formula provides an overestimated transaction size to ensure sufficient fees:
 * - Each input is approximated to 180 bytes.
 * - Each output is approximated to 34 bytes.
 * - Adds 10 bytes as a buffer for the transaction.
 * - Adds 40 bytes for an OP_RETURN output.
 * - Adds the number of inputs to account for additional overhead.
 *
 * @param {number} feeRate - The fee rate in satoshis per byte.
 * @param {number} numInputs - The number of inputs in the transaction.
 * @param {number} numOutputs - The number of outputs in the transaction.
 * @return {number} The estimated transaction fee in satoshis.
 */
export declare const getEstimatedFee: (feeRate: number, numInputs: number, numOutputs: number) => number;
export declare const inputValueSum: (inputUTXOs: UTXO[]) => number;
/**
 * Selects UTXOs and calculates the fee for a transaction.
 *
 * This method selects the highest value UTXOs from all available UTXOs to
 * cover the  amount and the transaction fees.
 *
 * Inputs:
 * - availableUTXOs: All available UTXOs from the wallet.
 * - amount: Amount to lock.
 * - feeRate: Fee rate for the transaction in satoshis per byte.
 * - numOfOutputs: Number of outputs in the transaction.
 *
 * Returns:
 * - selectedUTXOs: The UTXOs selected to cover the  amount and fees.
 * - fee: The total fee amount for the transaction.
 *
 * @param {UTXO[]} availableUTXOs - All available UTXOs from the wallet.
 * @param {number} amount - The amount to lock.
 * @param {number} feeRate - The fee rate in satoshis per byte.
 * @param {number} numOfOutputs - The number of outputs in the transaction.
 * @return {PsbtTransactionResult} An object containing the selected UTXOs and the fee.
 * @throws Will throw an error if there are insufficient funds or if the fee cannot be calculated.
 */
export declare const getTxInputUTXOsAndFees: (availableUTXOs: UTXO[], amount: number, feeRate: number, numOfOutputs: number) => {
    selectedUTXOs: UTXO[];
    fee: number;
};
