/// <reference types="node" />
import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { LockingScriptData } from "./script";
import { PsbtTransactionResult } from "../../types/transaction";
import { UTXO } from "../../types/UTXO";
import { LockingScripts } from "../../types/LockingScripts";
export { LockingScriptData };
export { type UTXO, type LockingScripts };
/**
 * Constructs an unsigned BTC Locking transaction in psbt format.
 *
 * Outputs:
 * - psbt:
 *   - The first output corresponds to the locking script with the specified amount.
 *   - The second output corresponds to the change from spending the amount and the transaction fee.
 *   - If a provably note script is provided, it will be added as the second output, and the fee will be the third output.
 * - fee: The total fee amount for the transaction.
 *
 * Inputs:
 * - scripts:
 *   - timelockScript, unbondingScript, slashingScript: Scripts for different transaction types.
 *   - provablyNoteScript: Optional provably note script.
 * - amount: Amount to lock.
 * - changeAddress: Address to send the change to.
 * - inputUTXOs: All available UTXOs from the wallet.
 * - network: Bitcoin network.
 * - feeRate: Fee rate in satoshis per byte.
 * - publicKeyNoCoord: Public key if the wallet is in taproot mode.
 * - lockHeight: Optional block height locktime to set for the transaction (i.e., not mined until the block height).
 *
 * @param {Object} scripts - Scripts used to construct the taproot output.
 * such as timelockScript, unbondingScript, slashingScript, and provablyNoteScript.
 * @param {number} amount - The amount to lock.
 * @param {string} changeAddress - The address to send the change to.
 * @param {UTXO[]} inputUTXOs - All available UTXOs from the wallet.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} feeRate - The fee rate in satoshis per byte.
 * @param {Buffer} [publicKeyNoCoord] - The public key if the wallet is in taproot mode.
 * @param {number} [lockHeight] - The optional block height locktime.
 * @return {PsbtTransactionResult} The partially signed transaction and the fee.
 * @throws Will throw an error if the amount or fee rate is less than or equal
 * to 0, if the change address is invalid, or if the public key is invalid.
 */
export declare function lockingTransaction(scripts: {
    timelockScript: Buffer;
    unbondingScript: Buffer;
    slashingScript: Buffer;
    provablyNoteScript?: Buffer;
}, amount: number, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number, publicKeyNoCoord?: Buffer, lockHeight?: number): PsbtTransactionResult;
/**
 * Constructs a withdrawal transaction for manually unbonded delegation.
 *
 * This transaction spends the unbonded output from the locking transaction.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 *   - slashingScript: Script for the slashing condition.
 * - tx: The original locking transaction.
 * - withdrawalAddress: The address to send the withdrawn funds to.
 * - network: The Bitcoin network.
 * - feeRate: The fee rate for the transaction in satoshis per byte.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * Returns:
 * - psbt: The partially signed transaction (PSBT).
 *
 * @param {Object} scripts - The scripts used in the transaction.
 * @param {Transaction} tx - The original locking transaction.
 * @param {string} withdrawalAddress - The address to send the withdrawn funds to.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @return {PsbtTransactionResult} An object containing the partially signed transaction (PSBT).
 */
export declare function withdrawEarlyUnbondedTransaction(scripts: {
    unbondingTimelockScript: Buffer;
    slashingScript: Buffer;
}, tx: Transaction, withdrawalAddress: string, network: networks.Network, feeRate: number, outputIndex?: number): PsbtTransactionResult;
/**
 * Constructs a withdrawal transaction for naturally unbonded delegation.
 *
 * This transaction spends the unbonded output from the locking transaction when the timelock has expired.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - timelockScript: Script for the timelock condition.
 *   - slashingScript: Script for the slashing condition.
 *   - unbondingScript: Script for the unbonding condition.
 * - tx: The original locking transaction.
 * - withdrawalAddress: The address to send the withdrawn funds to.
 * - network: The Bitcoin network.
 * - feeRate: The fee rate for the transaction in satoshis per byte.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * Returns:
 * - psbt: The partially signed transaction (PSBT).
 *
 * @param {Object} scripts - The scripts used in the transaction.
 * @param {Transaction} tx - The original locking transaction.
 * @param {string} withdrawalAddress - The address to send the withdrawn funds to.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @return {PsbtTransactionResult} An object containing the partially signed transaction (PSBT).
 */
export declare function withdrawTimelockUnbondedTransaction(scripts: {
    timelockScript: Buffer;
    slashingScript: Buffer;
    unbondingScript: Buffer;
}, tx: Transaction, withdrawalAddress: string, network: networks.Network, feeRate: number, outputIndex?: number): PsbtTransactionResult;
/**
 * Constructs a slashing transaction for a locking output without prior unbonding.
 *
 * This transaction spends the locking output of the locking transaction and distributes the funds
 * according to the specified slashing rate.
 *
 * Outputs:
 * - The first output sends `input * slashing_rate` funds to the slashing address.
 * - The second output sends `input * (1 - slashing_rate) - fee` funds back to the user's address.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - slashingScript: Script for the slashing condition.
 *   - timelockScript: Script for the timelock condition.
 *   - unbondingScript: Script for the unbonding condition.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 * - transaction: The original locking transaction.
 * - slashingAddress: The address to send the slashed funds to.
 * - slashingRate: The rate at which the funds are slashed (0 < slashingRate < 1).
 * - minimumFee: The minimum fee for the transaction in satoshis.
 * - network: The Bitcoin network.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * @param {Object} scripts - The scripts used in the transaction.
 * @param {Transaction} lockingTransaction - The original locking transaction. * @param {string} slashingAddress - The address to send the slashed funds to.
 * @param {string} slashingAddress: The address to send the slashed funds to.
 * @param {number} slashingRate - The rate at which the funds are slashed.
 * @param {number} minimumFee - The minimum fee for the transaction in satoshis.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @return {{ psbt: Psbt }} An object containing the partially signed transaction (PSBT).
 */
export declare function slashTimelockUnbondedTransaction(scripts: {
    slashingScript: Buffer;
    timelockScript: Buffer;
    unbondingScript: Buffer;
    unbondingTimelockScript: Buffer;
}, lockingTransaction: Transaction, slashingAddress: string, slashingRate: number, minimumFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
/**
 * Constructs a slashing transaction for an early unbonded transaction.
 *
 * This transaction spends the locking output of the locking transaction and distributes the funds
 * according to the specified slashing rate.
 *
 * Outputs:
 * - The first output sends `input * slashing_rate` funds to the slashing address.
 * - The second output sends `input * (1 - slashing_rate) - fee` funds back to the user's address.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - slashingScript: Script for the slashing condition.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 * - transaction: The original locking transaction.
 * - slashingAddress: The address to send the slashed funds to.
 * - slashingRate: The rate at which the funds are slashed (0 < slashingRate < 1).
 * - minimumFee: The minimum fee for the transaction in satoshis.
 * - network: The Bitcoin network.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * Returns:
 * - psbt: The partially signed transaction (PSBT).
 *
 * @param {Object} scripts - The scripts used in the transaction. e.g slashingScript, unbondingTimelockScript
 * @param {Transaction} lockingTransaction - The original locking transaction. * @param {string} slashingAddress - The address to send the slashed funds to.
 * @param {number} slashingAddress - The address that will be slashed.
 * @param {number} slashingRate - The rate at which the funds are slashed.
 * @param {number} minimumFee - The minimum fee for the transaction in satoshis.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @return {{ psbt: Psbt }} An object containing the partially signed transaction (PSBT).
 */
export declare function slashEarlyUnbondedTransaction(scripts: {
    slashingScript: Buffer;
    unbondingTimelockScript: Buffer;
}, lockingTransaction: Transaction, slashingAddress: string, slashingRate: number, minimumFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
export declare function unbondingTransaction(scripts: {
    unbondingScript: Buffer;
    unbondingTimelockScript: Buffer;
    timelockScript: Buffer;
    slashingScript: Buffer;
}, lockingTx: Transaction, transactionFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
export declare const createWitness: (originalWitness: Buffer[], paramsCovenants: Buffer[], covenantSigs: {
    btc_pk_hex: string;
    sig_hex: string;
}[]) => Buffer[];
/**
 * Creates a PSBT transaction to continue timelock locking.
 *
 * @param {Object} scripts - Scripts for different stages of the transaction.
 * @param {Buffer} scripts.timelockScript - Script to lock the transaction by height.
 * @param {Buffer} scripts.slashingScript - Script for slashing.
 * @param {Buffer} scripts.unbondingScript - Script for unbonding.
 * @param {Buffer} [scripts.provablyNoteScript] - Optional script for provably note.
 * @param {Transaction} tx - The original transaction to continue locking.
 * @param {networks.Network} network - The Bitcoin network to use (mainnet, testnet, etc.).
 * @param {number} feeRate - Fee rate in satoshis per byte.
 * @param {number} [outputIndex=0] - Index of the output to be spent.
 * @param {number} [additionalAmount=0] - Additional amount to be added to the output.
 * @param {string} changeAddress - Address for the change output.
 * @param {UTXO[]} inputUTXOs - Array of UTXOs to be used as inputs.
 * @param {Buffer} [publicKeyNoCoord] - Optional public key without coordinates.
 * @param {number} [lockHeight] - Optional lock height for the transaction.
 * @return {PsbtTransactionResult} - The result containing the PSBT transaction and additional data.
 */
export declare function continueTimelockLockingTransaction(scripts: {
    timelockScript: Buffer;
    slashingScript: Buffer;
    unbondingScript: Buffer;
    provablyNoteScript?: Buffer;
}, tx: Transaction, network: networks.Network, feeRate: number, outputIndex: number | undefined, additionalAmount: number | undefined, changeAddress: string, inputUTXOs: UTXO[], publicKeyNoCoord?: Buffer, lockHeight?: number): PsbtTransactionResult;
/**
 * Creates a PSBT transaction to continue unbonded locking.
 *
 * @param {Object} scripts - Scripts for different stages of the transaction.
 * @param {Buffer} scripts.timelockScript - Script to lock the transaction by height.
 * @param {Buffer} scripts.slashingScript - Script for slashing.
 * @param {Buffer} scripts.unbondingScript - Script for unbonding.
 * @param {Buffer} [scripts.provablyNoteScript] - Optional script for storing provably data.
 * @param {Transaction} lockingTx - The original transaction to continue locking.
 * @param {number} transactionFee - the fee for current transaction.
 * @param {networks.Network} network - The Bitcoin network to use (mainnet, testnet, etc.).
 * @param {number} [outputIndex=0] - Index of the output to be spent.
 * @param {number} [additionalAmount=0] - Additional amount to be added to the output.
 * @param {string} changeAddress - Address for the change output.
 * @param {UTXO[]} inputUTXOs - Array of UTXOs to be used as inputs.
 * @param {number} feeRate - Fee rate in satoshis per byte.
 * @param {Buffer} [publicKeyNoCoord] - Optional public key without coordinates.
 * @param {number} [lockHeight] - Optional lock height for the transaction.
 * @return {PsbtTransactionResult} - The result containing the PSBT transaction and additional data.
 */
export declare function continueUnbondingLockingTransaction(scripts: {
    unbondingScript: Buffer;
    unbondingTimelockScript: Buffer;
    timelockScript: Buffer;
    slashingScript: Buffer;
    provablyNoteScript: Buffer;
}, lockingTx: Transaction, transactionFee: number, network: networks.Network, outputIndex: number | undefined, additionalAmount: number | undefined, changeAddress: string, inputUTXOs: UTXO[], feeRate: number, publicKeyNoCoord?: Buffer, lockHeight?: number): PsbtTransactionResult;
