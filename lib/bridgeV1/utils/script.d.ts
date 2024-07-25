export declare const PK_LENGTH = 32;
export declare const ETH_PK_LENGTH = 20;
/**
 * Constructs a deposit script for validating transactions.
 * This script is designed to verify deposits by checking the signature against the user's public key.
 * @param {Buffer} evmAddress - The EVM address of the user.
 * @param {Buffer} posPubkey - The public key of the user.
 * @return {Buffer} - The compiled script buffer ready for use in blockchain transactions.
 */
export declare function buildDepositScript(evmAddress: Buffer, posPubkey: Buffer): Buffer;
/**
 * Script to validate transactions for a specific owner under certain conditions.
 * @param {Buffer} evmAddress - The owner's EVM address.
 * @param {Buffer} delegatorKey - The public key of the delegator.
 * @param {Buffer} validatorKey - The public key of the validator.
 * @param {number} transferTimeLock - The block count for the sequence verification.
 * @param {number} validatorIndex - Index of the validator.
 * @param {number} nonce - Nonce value for the transaction.
 * @return {Buffer}
 */
export declare function buildStakingScript(evmAddress: Buffer, delegatorKey: Buffer, validatorKey: Buffer, transferTimeLock: number, validatorIndex: number, nonce: number): Buffer;
