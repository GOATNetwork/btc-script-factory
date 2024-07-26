"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDepositTxInputUTXOsAndFees = exports.inputValueSum = exports.getEstimatedFee = exports.TX_BUFFER_SIZE_FOR_FEE_CAL = exports.OUTPUT_SIZE_FOR_FEE_CAL = exports.INPUT_SIZE_FOR_FEE_CAL = void 0;
// Estimated size of a transaction input in bytes for fee calculation purpose only
exports.INPUT_SIZE_FOR_FEE_CAL = 180;
// Estimated size of a transaction output in bytes for fee calculation purpose only
exports.OUTPUT_SIZE_FOR_FEE_CAL = 34;
// Buffer size for a transaction in bytes for fee calculation purpose only
exports.TX_BUFFER_SIZE_FOR_FEE_CAL = 10;
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
const getEstimatedFee = (feeRate, numInputs, numOutputs) => {
    return (numInputs * exports.INPUT_SIZE_FOR_FEE_CAL +
        numOutputs * exports.OUTPUT_SIZE_FOR_FEE_CAL +
        exports.TX_BUFFER_SIZE_FOR_FEE_CAL + numInputs) * feeRate;
};
exports.getEstimatedFee = getEstimatedFee;
// inputValueSum returns the sum of the values of the UTXOs
const inputValueSum = (inputUTXOs) => {
    return inputUTXOs.reduce((acc, utxo) => acc + utxo.value, 0);
};
exports.inputValueSum = inputValueSum;
const getDepositTxInputUTXOsAndFees = (availableUTXOs, depositAmount, feeRate, numOfOutputs) => {
    if (availableUTXOs.length === 0) {
        throw new Error("Insufficient funds");
    }
    // Sort available UTXOs from highest to lowest value
    availableUTXOs.sort((a, b) => b.value - a.value);
    let selectedUTXOs = [];
    let accumulatedValue = 0;
    let estimatedFee;
    for (const utxo of availableUTXOs) {
        selectedUTXOs.push(utxo);
        accumulatedValue += utxo.value;
        estimatedFee = (0, exports.getEstimatedFee)(feeRate, selectedUTXOs.length, numOfOutputs);
        // console.log(`estimatedFee ${estimatedFee}, feeRate ${feeRate}, accumulatedValue ${accumulatedValue}, ${numOfOutputs}`);
        if (accumulatedValue >= depositAmount + estimatedFee) {
            break;
        }
    }
    if (!estimatedFee) {
        throw new Error("Unable to calculate fee.");
    }
    console.log(`selectedUTXOs ${selectedUTXOs.length}, accumulatedValue ${accumulatedValue}, depositAmount ${depositAmount}, estimatedFee ${estimatedFee}`);
    if (accumulatedValue < depositAmount + estimatedFee) {
        throw new Error("Insufficient funds: unable to gather enough UTXOs to cover the deposit amount and fees.");
    }
    return {
        selectedUTXOs,
        fee: estimatedFee
    };
};
exports.getDepositTxInputUTXOsAndFees = getDepositTxInputUTXOsAndFees;
