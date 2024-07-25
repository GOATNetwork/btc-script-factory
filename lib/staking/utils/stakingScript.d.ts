/// <reference types="node" />
import { StakingScripts } from "../types/StakingScripts";
export declare const PK_LENGTH = 32;
export declare class StakingScriptData {
    #private;
    constructor(stakerKey: Buffer, covenantKeys: Buffer[], covenantThreshold: number, stakingTimelock: number, unbondingTimelock: number, magicBytes: Buffer);
    /**
     * Validates the staking script.
     * @return {boolean} Returns true if the staking script is valid, otherwise false.
     */
    validate(): boolean;
    /**
     * Builds a timelock script.
     * @param {number} timelock - The timelock value to encode in the script.
     * @return {Buffer} containing the compiled timelock script.
     */
    buildTimelockScript(timelock: number): Buffer;
    /**
     * Builds the staking timelock script.
     * Only holder of private key for given pubKey can spend after relative lock time
     * Creates the timelock script in the form:
     *    <stakerPubKey>
     *    OP_CHECKSIGVERIFY
     *    <stakingTimeBlocks>
     *    OP_CHECKSEQUENCEVERIFY
     * @return {Buffer} The staking timelock script.
     */
    buildStakingTimelockScript(): Buffer;
    /**
     * Builds the unbonding timelock script.
     * Creates the unbonding timelock script in the form:
     *    <stakerPubKey>
     *    OP_CHECKSIGVERIFY
     *    <unbondingTimeBlocks>
     *    OP_CHECKSEQUENCEVERIFY
     * @return {Buffer} The unbonding timelock script.
     */
    buildUnbondingTimelockScript(): Buffer;
    /**
     * Builds the unbonding script in the form:
     *    buildSingleKeyScript(stakerPk, true) ||
     *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
     *    || means combining the scripts
     * @return {Buffer} The unbonding script.
     */
    buildUnbondingScript(): Buffer;
    /**
     * Builds the slashing script for staking in the form:
     *    buildSingleKeyScript(stakerPk, true) ||
     *    buildMultiKeyScript(finalityProviderPKs, 1, true) ||
     *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
     *    || means combining the scripts
     * The slashing script is a combination of single-key and multi-key scripts.
     * The single-key script is used for staker key verification.
     * The multi-key script is used for finality provider key verification and covenant key verification.
     * @return {Buffer} The slashing script as a Buffer.
     */
    buildSlashingScript(): Buffer;
    /**
     * Builds a data embed script for staking in the form:
     *    OP_RETURN || <serializedStakingData>
     * where serializedStakingData is the concatenation of:
     *    MagicBytes || Version || StakerPublicKey || FinalityProviderPublicKey || StakingTimeLock
     * @return {Buffer} The compiled data embed script.
     */
    buildDataEmbedScript(): Buffer;
    /**
     * Builds the staking scripts.
     * @return {StakingScripts} The staking scripts.
     */
    buildScripts(): StakingScripts;
}
