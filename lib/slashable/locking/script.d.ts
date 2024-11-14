/// <reference types="node" />
import { LockingScripts } from "../../types/LockingScripts";
export declare const PK_LENGTH = 32;
export declare class LockingScriptData {
    #private;
    constructor(lockerKey: Buffer, operatorKeys: Buffer[], covenantKeys: Buffer[], covenantThreshold: number, lockingTimelock: number, unbondingTimelock: number, magicBytes: Buffer);
    /**
     * Validates the locking script.
     * @return {boolean} Returns true if the locking script is valid, otherwise false.
     */
    validate(): boolean;
    /**
     * Builds a timelock script.
     * @param {number} timelock - The timelock value to encode in the script.
     * @return {Buffer} containing the compiled timelock script.
     */
    buildTimelockScript(timelock: number): Buffer;
    /**
     * Builds the locking timelock script.
     * Only holder of private key for given pubKey can spend after relative lock time
     * Creates the timelock script in the form:
     *    <lockerPubKey>
     *    OP_CHECKSIGVERIFY
     *    <lockingTimeBlocks>
     *    OP_CHECKSEQUENCEVERIFY
     * @return {Buffer} The locking timelock script.
     */
    buildLockingTimelockScript(): Buffer;
    /**
     * Builds the unbonding timelock script.
     * Creates the unbonding timelock script in the form:
     *    <lockerPubKey>
     *    OP_CHECKSIGVERIFY
     *    <unbondingTimeBlocks>
     *    OP_CHECKSEQUENCEVERIFY
     * @return {Buffer} The unbonding timelock script.
     */
    buildUnbondingTimelockScript(): Buffer;
    /**
     * Builds the unbonding script in the form:
     *    buildSingleKeyScript(lockerPk, true) ||
     *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
     *    || means combining the scripts
     * @return {Buffer} The unbonding script.
     */
    buildUnbondingScript(): Buffer;
    /**
     * Builds the slashing script for locking in the form:
     *    buildSingleKeyScript(lockerPk, true) ||
     *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
     *    || means combining the scripts
     * The slashing script is a combination of single-key and multi-key scripts.
     * The single-key script is used for locker key verification.
     * The multi-key script is used for covenant key verification.
     * @return {Buffer} The slashing script as a Buffer.
     */
    buildSlashingScript(): Buffer;
    /**
     * Builds a data script for locking in the form:
     *    OP_RETURN || <serializedLockingData>
     * where serializedLockingData is the concatenation of:
     *    MagicBytes || Version || lockerPublicKey || LockingTimeLock
     * @return {Buffer} The compiled provably note script.
     */
    buildProvablyNoteScript(): Buffer;
    /**
     * Builds the locking scripts.
     * @return {LockingScripts} The locking scripts.
     */
    buildScripts(): LockingScripts;
}
