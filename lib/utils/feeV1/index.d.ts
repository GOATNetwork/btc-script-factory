/// <reference types="node" />
import { Network } from "bitcoinjs-lib";
import { UTXO } from "../../types/UTXO";
import { PsbtOutputExtended } from "../../types/psbtOutputs";
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
export declare const getSpendTxInputUTXOsAndFees: (network: Network, availableUTXOs: UTXO[], spendAmount: number, feeRate: number, outputs: PsbtOutputExtended[]) => {
    selectedUTXOs: UTXO[];
    fee: number;
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
export declare const calculateSpendAmountAndFee: (network: Network, availableUTXOs: UTXO[], feeRate: number, outputs: PsbtOutputExtended[]) => {
    fee: number;
    spendAmount: number;
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
 * @return {number} The estimated fee for a withdrawal transaction in satoshis.
 */
export declare const getWithdrawTxFee: (feeRate: number, script: Buffer) => number;
