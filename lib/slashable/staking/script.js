"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _StakingScriptData_instances, _StakingScriptData_stakerKey, _StakingScriptData_covenantKeys, _StakingScriptData_covenantThreshold, _StakingScriptData_stakingTimeLock, _StakingScriptData_unbondingTimeLock, _StakingScriptData_magicBytes, _StakingScriptData_buildSingleKeyScript, _StakingScriptData_buildMultiKeyScript;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StakingScriptData = exports.PK_LENGTH = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
// PK_LENGTH denotes the length of a public key in bytes
exports.PK_LENGTH = 32;
// StakingScriptData is a class that holds the data required for the BTC Staking Script
// and exposes methods for converting it into useful formats
class StakingScriptData {
    constructor(
    // The `stakerKey` is the public key of the staker without the coordinate bytes.
    stakerKey, 
    // A list of the public keys without the coordinate bytes corresponding to
    // the covenant emulators.
    // This is a parameter of the goat system and should be retrieved from there.
    covenantKeys, 
    // The number of covenant emulator signatures required for a transaction
    // to be valid.
    // This is a parameter of the goat system and should be retrieved from there.
    covenantThreshold, 
    // The staking period denoted as a number of BTC blocks.
    stakingTimelock, 
    // The unbonding period denoted as a number of BTC blocks.
    // This value should be more than equal than the minimum unbonding time of the
    // goat system.
    unbondingTimelock, 
    // The magic bytes used to identify the staking transaction on goat
    // through the data return script
    magicBytes) {
        _StakingScriptData_instances.add(this);
        _StakingScriptData_stakerKey.set(this, void 0);
        _StakingScriptData_covenantKeys.set(this, void 0);
        _StakingScriptData_covenantThreshold.set(this, void 0);
        _StakingScriptData_stakingTimeLock.set(this, void 0);
        _StakingScriptData_unbondingTimeLock.set(this, void 0);
        _StakingScriptData_magicBytes.set(this, void 0);
        // Check that required input values are not missing when creating an instance of the StakingScriptData class
        if (!stakerKey ||
            !covenantKeys ||
            !covenantThreshold ||
            !stakingTimelock ||
            !unbondingTimelock ||
            !magicBytes) {
            throw new Error("Missing required input values");
        }
        __classPrivateFieldSet(this, _StakingScriptData_stakerKey, stakerKey, "f");
        __classPrivateFieldSet(this, _StakingScriptData_covenantKeys, covenantKeys, "f");
        __classPrivateFieldSet(this, _StakingScriptData_covenantThreshold, covenantThreshold, "f");
        __classPrivateFieldSet(this, _StakingScriptData_stakingTimeLock, stakingTimelock, "f");
        __classPrivateFieldSet(this, _StakingScriptData_unbondingTimeLock, unbondingTimelock, "f");
        __classPrivateFieldSet(this, _StakingScriptData_magicBytes, magicBytes, "f");
        // Run the validate method to check if the provided script data is valid
        if (!this.validate()) {
            throw new Error("Invalid script data provided");
        }
    }
    /**
     * Validates the staking script.
     * @return {boolean} Returns true if the staking script is valid, otherwise false.
     */
    validate() {
        // check that staker key is the correct length
        if (__classPrivateFieldGet(this, _StakingScriptData_stakerKey, "f").length != exports.PK_LENGTH) {
            return false;
        }
        // check that covenant keys are the correct length
        if (__classPrivateFieldGet(this, _StakingScriptData_covenantKeys, "f").some((covenantKey) => covenantKey.length != exports.PK_LENGTH)) {
            return false;
        }
        // check that maximum value for staking time is not greater than uint16
        if (__classPrivateFieldGet(this, _StakingScriptData_stakingTimeLock, "f") > 65535) {
            return false;
        }
        return true;
    }
    /**
     * Builds a timelock script.
     * @param {number} timelock - The timelock value to encode in the script.
     * @return {Buffer} containing the compiled timelock script.
     */
    buildTimelockScript(timelock) {
        return bitcoinjs_lib_1.script.compile([
            __classPrivateFieldGet(this, _StakingScriptData_stakerKey, "f"),
            bitcoinjs_lib_1.opcodes.OP_CHECKSIGVERIFY,
            bitcoinjs_lib_1.script.number.encode(timelock),
            bitcoinjs_lib_1.opcodes.OP_CHECKSEQUENCEVERIFY
        ]);
    }
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
    buildStakingTimelockScript() {
        return this.buildTimelockScript(__classPrivateFieldGet(this, _StakingScriptData_stakingTimeLock, "f"));
    }
    /**
     * Builds the unbonding timelock script.
     * Creates the unbonding timelock script in the form:
     *    <stakerPubKey>
     *    OP_CHECKSIGVERIFY
     *    <unbondingTimeBlocks>
     *    OP_CHECKSEQUENCEVERIFY
     * @return {Buffer} The unbonding timelock script.
     */
    buildUnbondingTimelockScript() {
        return this.buildTimelockScript(__classPrivateFieldGet(this, _StakingScriptData_unbondingTimeLock, "f"));
    }
    /**
     * Builds the unbonding script in the form:
     *    buildSingleKeyScript(stakerPk, true) ||
     *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
     *    || means combining the scripts
     * @return {Buffer} The unbonding script.
     */
    buildUnbondingScript() {
        return Buffer.concat([
            __classPrivateFieldGet(this, _StakingScriptData_instances, "m", _StakingScriptData_buildSingleKeyScript).call(this, __classPrivateFieldGet(this, _StakingScriptData_stakerKey, "f"), true),
            __classPrivateFieldGet(this, _StakingScriptData_instances, "m", _StakingScriptData_buildMultiKeyScript).call(this, __classPrivateFieldGet(this, _StakingScriptData_covenantKeys, "f"), __classPrivateFieldGet(this, _StakingScriptData_covenantThreshold, "f"), false)
        ]);
    }
    /**
     * Builds the slashing script for staking in the form:
     *    buildSingleKeyScript(stakerPk, true) ||
     *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
     *    || means combining the scripts
     * The slashing script is a combination of single-key and multi-key scripts.
     * The single-key script is used for staker key verification.
     * The multi-key script is used for covenant key verification.
     * @return {Buffer} The slashing script as a Buffer.
     */
    buildSlashingScript() {
        return Buffer.concat([
            __classPrivateFieldGet(this, _StakingScriptData_instances, "m", _StakingScriptData_buildSingleKeyScript).call(this, __classPrivateFieldGet(this, _StakingScriptData_stakerKey, "f"), true),
            __classPrivateFieldGet(this, _StakingScriptData_instances, "m", _StakingScriptData_buildMultiKeyScript).call(this, __classPrivateFieldGet(this, _StakingScriptData_covenantKeys, "f"), __classPrivateFieldGet(this, _StakingScriptData_covenantThreshold, "f"), 
            // No need to add verify since covenants are at the end of the script
            false)
        ]);
    }
    /**
     * Builds a data script for staking in the form:
     *    OP_RETURN || <serializedStakingData>
     * where serializedStakingData is the concatenation of:
     *    MagicBytes || Version || StakerPublicKey || StakingTimeLock
     * @return {Buffer} The compiled provably note script.
     */
    buildProvablyNoteScript() {
        // 1 byte for version
        const version = Buffer.alloc(1);
        version.writeUInt8(0);
        // 2 bytes for staking time
        const stakingTimeLock = Buffer.alloc(2);
        // big endian
        stakingTimeLock.writeUInt16BE(__classPrivateFieldGet(this, _StakingScriptData_stakingTimeLock, "f"));
        const serializedStakingData = Buffer.concat([
            __classPrivateFieldGet(this, _StakingScriptData_magicBytes, "f"),
            version,
            __classPrivateFieldGet(this, _StakingScriptData_stakerKey, "f"),
            stakingTimeLock
        ]);
        return bitcoinjs_lib_1.script.compile([bitcoinjs_lib_1.opcodes.OP_RETURN, serializedStakingData]);
    }
    /**
     * Builds the staking scripts.
     * @return {StakingScripts} The staking scripts.
     */
    buildScripts() {
        return {
            timelockScript: this.buildStakingTimelockScript(),
            unbondingScript: this.buildUnbondingScript(),
            slashingScript: this.buildSlashingScript(),
            unbondingTimelockScript: this.buildUnbondingTimelockScript(),
            provablyNoteScript: this.buildProvablyNoteScript()
        };
    }
}
exports.StakingScriptData = StakingScriptData;
_StakingScriptData_stakerKey = new WeakMap(), _StakingScriptData_covenantKeys = new WeakMap(), _StakingScriptData_covenantThreshold = new WeakMap(), _StakingScriptData_stakingTimeLock = new WeakMap(), _StakingScriptData_unbondingTimeLock = new WeakMap(), _StakingScriptData_magicBytes = new WeakMap(), _StakingScriptData_instances = new WeakSet(), _StakingScriptData_buildSingleKeyScript = function _StakingScriptData_buildSingleKeyScript(pk, withVerify) {
    // Check public key length
    if (pk.length != exports.PK_LENGTH) {
        throw new Error("Invalid key length");
    }
    return bitcoinjs_lib_1.script.compile([
        pk,
        withVerify ? bitcoinjs_lib_1.opcodes.OP_CHECKSIGVERIFY : bitcoinjs_lib_1.opcodes.OP_CHECKSIG
    ]);
}, _StakingScriptData_buildMultiKeyScript = function _StakingScriptData_buildMultiKeyScript(pks, threshold, withVerify) {
    // Verify that pks is not empty
    if (!pks || pks.length === 0) {
        throw new Error("No keys provided");
    }
    // Check buffer object have expected lengths like checking pks.length
    if (pks.some((pk) => pk.length != exports.PK_LENGTH)) {
        throw new Error("Invalid key length");
    }
    // Verify that threshold <= len(pks)
    if (threshold > pks.length) {
        throw new Error("Required number of valid signers is greater than number of provided keys");
    }
    if (pks.length === 1) {
        return __classPrivateFieldGet(this, _StakingScriptData_instances, "m", _StakingScriptData_buildSingleKeyScript).call(this, pks[0], withVerify);
    }
    // keys must be sorted
    const sortedPks = pks.sort(Buffer.compare);
    // verify there are no duplicates
    for (let i = 0; i < sortedPks.length - 1; ++i) {
        if (sortedPks[i].equals(sortedPks[i + 1])) {
            throw new Error("Duplicate keys provided");
        }
    }
    const scriptElements = [sortedPks[0], bitcoinjs_lib_1.opcodes.OP_CHECKSIG];
    for (let i = 1; i < sortedPks.length; i++) {
        scriptElements.push(sortedPks[i]);
        scriptElements.push(bitcoinjs_lib_1.opcodes.OP_CHECKSIGADD);
    }
    scriptElements.push(bitcoinjs_lib_1.script.number.encode(threshold));
    if (withVerify) {
        scriptElements.push(bitcoinjs_lib_1.opcodes.OP_NUMEQUALVERIFY);
    }
    else {
        scriptElements.push(bitcoinjs_lib_1.opcodes.OP_NUMEQUAL);
    }
    return bitcoinjs_lib_1.script.compile(scriptElements);
};
