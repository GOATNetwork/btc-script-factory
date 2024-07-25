/// <reference types="node" />
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
