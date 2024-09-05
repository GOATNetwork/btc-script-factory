/// <reference types="node" />
import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { buildDataEmbedScript, buildDepositScript, parseDataEmbedScript } from "./bridge.script";
import { UTXO } from "../types/UTXO";
export { buildDepositScript, buildDataEmbedScript, parseDataEmbedScript };
/**
 * Creates a deposit transaction with the specified parameters.
 * @param {Object} scripts - The scripts used for the transaction.
 * @param {Buffer} scripts.depositScript - The deposit script.
 * @param {number} amount - The amount to deposit in satoshis. Must be a non-negative integer greater than 0.
 * @param {string} changeAddress - The address to send any change back to.
 * @param {UTXO[]} inputUTXOs - The list of input UTXOs.
 * @param {networks.Network} network - The Bitcoin network to use.
 * @param {number} feeRate - The fee rate in satoshis per byte. Must be a non-negative integer greater than 0.
 * @return {PsbtTransactionResult} - The PSBT transaction result containing the PSBT and the calculated fee.
 */
export declare function depositTransaction(scripts: {
    depositScript: Buffer;
}, amount: number, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number): {
    psbt: Psbt;
    fee: number;
};
/**
 * Creates a transaction to deposit funds to a fixed address with an optional data embedding script.
 * @param {Object} scripts - Scripts used in the transaction.
 * @param {Buffer} scripts.dataEmbedScript - The data embedding script.
 * @param {number} amount - The amount of funds to deposit. Must be greater than 0.
 * @param {string} fixedAddress - The fixed address to deposit funds to.
 * @param {string} changeAddress - The address to send any change back to.
 * @param {UTXO[]} inputUTXOs - Array of input UTXOs.
 * @param {networks.Network} network - The network to use for the transaction.
 * @param {number} feeRate - The fee rate for the transaction. Must be greater than 0.
 * @return {Object} - An object containing the PSBT and the calculated fee.
 */
export declare function depositToFixedAddressTransaction(scripts: {
    dataEmbedScript: Buffer;
}, amount: number, fixedAddress: string, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number): {
    psbt: Psbt;
    fee: number;
};
export declare function sendTransaction(scripts: {
    depositScript: Buffer;
}, depositTransaction: Transaction, sendAddress: string, minimumFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
