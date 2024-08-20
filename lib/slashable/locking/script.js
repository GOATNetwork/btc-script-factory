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
var _LockingScriptData_instances, _LockingScriptData_lockerKey, _LockingScriptData_operatorKeys, _LockingScriptData_covenantKeys, _LockingScriptData_covenantThreshold, _LockingScriptData_lockingTimeLock, _LockingScriptData_unbondingTimeLock, _LockingScriptData_magicBytes, _LockingScriptData_buildSingleKeyScript, _LockingScriptData_buildMultiKeyScript;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockingScriptData = exports.PK_LENGTH = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
// PK_LENGTH denotes the length of a public key in bytes
exports.PK_LENGTH = 32;
// LockingScriptData is a class that holds the data required for the BTC Locking Script
// and exposes methods for converting it into useful formats
class LockingScriptData {
    constructor(
    // The `lockerKey` is the public key of the locker without the coordinate bytes.
    lockerKey, 
    // A list of the public keys indicating the sequencer nodes
    operatorKeys, 
    // A list of the public keys indicating the committee members.
    // This is a parameter of the goat system and should be retrieved from there.
    covenantKeys, 
    // The number of covenant signatures required for a transaction
    // to be valid.
    // This is a parameter of the goat system and should be retrieved from there.
    covenantThreshold, 
    // The locking period denoted as a number of BTC blocks.
    lockingTimelock, 
    // The unbonding period denoted as a number of BTC blocks.
    // This value should be more than equal than the minimum unbonding time of the
    // goat system.
    unbondingTimelock, 
    // The magic bytes used to identify the locking transaction on goat
    // through the data return script
    magicBytes) {
        _LockingScriptData_instances.add(this);
        _LockingScriptData_lockerKey.set(this, void 0);
        _LockingScriptData_operatorKeys.set(this, void 0);
        _LockingScriptData_covenantKeys.set(this, void 0);
        _LockingScriptData_covenantThreshold.set(this, void 0);
        _LockingScriptData_lockingTimeLock.set(this, void 0);
        _LockingScriptData_unbondingTimeLock.set(this, void 0);
        _LockingScriptData_magicBytes.set(this, void 0);
        // Check that required input values are not missing when creating an instance of the LockingScriptData class
        if (!lockerKey ||
            !operatorKeys ||
            !covenantKeys ||
            !covenantThreshold ||
            !lockingTimelock ||
            !unbondingTimelock ||
            !magicBytes) {
            throw new Error("Missing required input values");
        }
        __classPrivateFieldSet(this, _LockingScriptData_lockerKey, lockerKey, "f");
        __classPrivateFieldSet(this, _LockingScriptData_operatorKeys, operatorKeys, "f");
        __classPrivateFieldSet(this, _LockingScriptData_covenantKeys, covenantKeys, "f");
        __classPrivateFieldSet(this, _LockingScriptData_covenantThreshold, covenantThreshold, "f");
        __classPrivateFieldSet(this, _LockingScriptData_lockingTimeLock, lockingTimelock, "f");
        __classPrivateFieldSet(this, _LockingScriptData_unbondingTimeLock, unbondingTimelock, "f");
        __classPrivateFieldSet(this, _LockingScriptData_magicBytes, magicBytes, "f");
        // Run the validate method to check if the provided script data is valid
        if (!this.validate()) {
            throw new Error("Invalid script data provided");
        }
    }
    /**
     * Validates the locking script.
     * @return {boolean} Returns true if the locking script is valid, otherwise false.
     */
    validate() {
        // check that locker key is the correct length
        if (__classPrivateFieldGet(this, _LockingScriptData_lockerKey, "f").length != exports.PK_LENGTH) {
            return false;
        }
        // check that operator keys are the correct length
        if (__classPrivateFieldGet(this, _LockingScriptData_operatorKeys, "f").some((operatorKey) => operatorKey.length != exports.PK_LENGTH)) {
            return false;
        }
        // check that covenant keys are the correct length
        if (__classPrivateFieldGet(this, _LockingScriptData_covenantKeys, "f").some((covenantKey) => covenantKey.length != exports.PK_LENGTH)) {
            return false;
        }
        // Check whether we have any duplicate keys
        const allPks = [
            __classPrivateFieldGet(this, _LockingScriptData_lockerKey, "f"),
            ...__classPrivateFieldGet(this, _LockingScriptData_operatorKeys, "f"),
            ...__classPrivateFieldGet(this, _LockingScriptData_covenantKeys, "f")
        ];
        const allPksSet = new Set(allPks);
        if (allPks.length !== allPksSet.size) {
            return false;
        }
        // check that the threshold is above 0 and less than or equal to
        // the size of the covenant set
        if (__classPrivateFieldGet(this, _LockingScriptData_covenantThreshold, "f") == 0 ||
            __classPrivateFieldGet(this, _LockingScriptData_covenantThreshold, "f") > __classPrivateFieldGet(this, _LockingScriptData_covenantKeys, "f").length) {
            return false;
        }
        // check that maximum value for staking time is not greater than uint16 and above 0
        if (__classPrivateFieldGet(this, _LockingScriptData_lockingTimeLock, "f") == 0 || __classPrivateFieldGet(this, _LockingScriptData_lockingTimeLock, "f") > 65535) {
            return false;
        }
        // check that maximum value for unbonding time is not greater than uint16 and above 0
        if (__classPrivateFieldGet(this, _LockingScriptData_unbondingTimeLock, "f") == 0 || __classPrivateFieldGet(this, _LockingScriptData_unbondingTimeLock, "f") > 65535) {
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
            __classPrivateFieldGet(this, _LockingScriptData_lockerKey, "f"),
            bitcoinjs_lib_1.opcodes.OP_CHECKSIGVERIFY,
            bitcoinjs_lib_1.script.number.encode(timelock),
            bitcoinjs_lib_1.opcodes.OP_CHECKSEQUENCEVERIFY
        ]);
    }
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
    buildLockingTimelockScript() {
        return this.buildTimelockScript(__classPrivateFieldGet(this, _LockingScriptData_lockingTimeLock, "f"));
    }
    /**
     * Builds the unbonding timelock script.
     * Creates the unbonding timelock script in the form:
     *    <lockerPubKey>
     *    OP_CHECKSIGVERIFY
     *    <unbondingTimeBlocks>
     *    OP_CHECKSEQUENCEVERIFY
     * @return {Buffer} The unbonding timelock script.
     */
    buildUnbondingTimelockScript() {
        return this.buildTimelockScript(__classPrivateFieldGet(this, _LockingScriptData_unbondingTimeLock, "f"));
    }
    /**
     * Builds the unbonding script in the form:
     *    buildSingleKeyScript(lockerPk, true) ||
     *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
     *    || means combining the scripts
     * @return {Buffer} The unbonding script.
     */
    buildUnbondingScript() {
        return Buffer.concat([
            __classPrivateFieldGet(this, _LockingScriptData_instances, "m", _LockingScriptData_buildSingleKeyScript).call(this, __classPrivateFieldGet(this, _LockingScriptData_lockerKey, "f"), true),
            __classPrivateFieldGet(this, _LockingScriptData_instances, "m", _LockingScriptData_buildMultiKeyScript).call(this, __classPrivateFieldGet(this, _LockingScriptData_covenantKeys, "f"), __classPrivateFieldGet(this, _LockingScriptData_covenantThreshold, "f"), false)
        ]);
    }
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
    buildSlashingScript() {
        return Buffer.concat([
            __classPrivateFieldGet(this, _LockingScriptData_instances, "m", _LockingScriptData_buildSingleKeyScript).call(this, __classPrivateFieldGet(this, _LockingScriptData_lockerKey, "f"), true),
            __classPrivateFieldGet(this, _LockingScriptData_instances, "m", _LockingScriptData_buildMultiKeyScript).call(this, __classPrivateFieldGet(this, _LockingScriptData_operatorKeys, "f"), 1, true),
            __classPrivateFieldGet(this, _LockingScriptData_instances, "m", _LockingScriptData_buildMultiKeyScript).call(this, __classPrivateFieldGet(this, _LockingScriptData_covenantKeys, "f"), __classPrivateFieldGet(this, _LockingScriptData_covenantThreshold, "f"), 
            // No need to add verify since covenants are at the end of the script
            false)
        ]);
    }
    /**
     * Builds a data script for locking in the form:
     *    OP_RETURN || <serializedLockingData>
     * where serializedLockingData is the concatenation of:
     *    MagicBytes || Version || lockerPublicKey || LockingTimeLock
     * @return {Buffer} The compiled provably note script.
     */
    buildProvablyNoteScript() {
        // 1 byte for version
        const version = Buffer.alloc(1);
        version.writeUInt8(0);
        // 2 bytes for locking time
        const lockingTimeLock = Buffer.alloc(2);
        // big endian
        lockingTimeLock.writeUInt16BE(__classPrivateFieldGet(this, _LockingScriptData_lockingTimeLock, "f"));
        const serializedLockingData = Buffer.concat([
            __classPrivateFieldGet(this, _LockingScriptData_magicBytes, "f"),
            version,
            __classPrivateFieldGet(this, _LockingScriptData_lockerKey, "f"),
            __classPrivateFieldGet(this, _LockingScriptData_operatorKeys, "f")[0],
            lockingTimeLock
        ]);
        return bitcoinjs_lib_1.script.compile([bitcoinjs_lib_1.opcodes.OP_RETURN, serializedLockingData]);
    }
    /**
     * Builds the locking scripts.
     * @return {LockingScripts} The locking scripts.
     */
    buildScripts() {
        return {
            timelockScript: this.buildLockingTimelockScript(),
            unbondingScript: this.buildUnbondingScript(),
            slashingScript: this.buildSlashingScript(),
            unbondingTimelockScript: this.buildUnbondingTimelockScript(),
            provablyNoteScript: this.buildProvablyNoteScript()
        };
    }
}
exports.LockingScriptData = LockingScriptData;
_LockingScriptData_lockerKey = new WeakMap(), _LockingScriptData_operatorKeys = new WeakMap(), _LockingScriptData_covenantKeys = new WeakMap(), _LockingScriptData_covenantThreshold = new WeakMap(), _LockingScriptData_lockingTimeLock = new WeakMap(), _LockingScriptData_unbondingTimeLock = new WeakMap(), _LockingScriptData_magicBytes = new WeakMap(), _LockingScriptData_instances = new WeakSet(), _LockingScriptData_buildSingleKeyScript = function _LockingScriptData_buildSingleKeyScript(pk, withVerify) {
    // Check public key length
    if (pk.length != exports.PK_LENGTH) {
        throw new Error("Invalid key length");
    }
    return bitcoinjs_lib_1.script.compile([
        pk,
        withVerify ? bitcoinjs_lib_1.opcodes.OP_CHECKSIGVERIFY : bitcoinjs_lib_1.opcodes.OP_CHECKSIG
    ]);
}, _LockingScriptData_buildMultiKeyScript = function _LockingScriptData_buildMultiKeyScript(pks, threshold, withVerify) {
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
        return __classPrivateFieldGet(this, _LockingScriptData_instances, "m", _LockingScriptData_buildSingleKeyScript).call(this, pks[0], withVerify);
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
