import { UTXO } from "../types/UTXO";
export declare const INPUT_SIZE_FOR_FEE_CAL = 180;
export declare const OUTPUT_SIZE_FOR_FEE_CAL = 34;
export declare const TX_BUFFER_SIZE_FOR_FEE_CAL = 10;
export declare const ESTIMATED_OP_RETURN_SIZE = 40;
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
export declare const getDepositTxInputUTXOsAndFees: (availableUTXOs: UTXO[], depositAmount: number, feeRate: number, numOfOutputs: number) => {
    selectedUTXOs: UTXO[];
    fee: number;
};
