/**
 * Script to validate transactions for a specific owner under certain conditions.
 * @param {Buffer} evmAddress - The owner's EVM address.
 * @param {Buffer} delegatorKey - The public key of the delegator.
 * @param {Buffer} validatorKey - The public key of the validator.
 * @param {number} transferTimeLock - The block count for the sequence verification.
 * @param {Buffer} validatorIndex - Index of the validator.
 * @param {Buffer} nonce - Nonce value for the transaction.
 * @return {Buffer}
 */
export declare function buildLockingScript(evmAddress: Buffer, delegatorKey: Buffer, validatorKey: Buffer, transferTimeLock: number, validatorIndex: Buffer, nonce: Buffer): Buffer;
/**
 * Script to validate pre-deposit transactions.
 * This version only requires validator signature in the ELSE path.
 * @param {Buffer} lockerKey - The public key of the locker (user).
 * @param {number} transferTimeLock - The block count for the sequence verification.
 * @return {Buffer}
 */
export declare function buildPreDepositLockingScript(lockerKey: Buffer, transferTimeLock: number): Buffer;
