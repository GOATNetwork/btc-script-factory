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
var _BridgeScriptData_instances, _BridgeScriptData_userKey, _BridgeScriptData_covenantKeys, _BridgeScriptData_covenantThreshold, _BridgeScriptData_transferTimeLock, _BridgeScriptData_magicBytes, _BridgeScriptData_evmAddress, _BridgeScriptData_buildSingleKeyScript, _BridgeScriptData_buildMultiKeyScript;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeScriptData = exports.ETH_PK_LENGTH = exports.PK_LENGTH = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
exports.PK_LENGTH = 32;
exports.ETH_PK_LENGTH = 20;
class BridgeScriptData {
    constructor(userKey, covenantKeys, covenantThreshold, transferTimeLock, magicBytes, evmAddress) {
        _BridgeScriptData_instances.add(this);
        _BridgeScriptData_userKey.set(this, void 0);
        _BridgeScriptData_covenantKeys.set(this, void 0);
        _BridgeScriptData_covenantThreshold.set(this, void 0);
        _BridgeScriptData_transferTimeLock.set(this, void 0);
        _BridgeScriptData_magicBytes.set(this, void 0);
        _BridgeScriptData_evmAddress.set(this, void 0);
        if (!userKey ||
            !covenantKeys ||
            !covenantThreshold ||
            !transferTimeLock ||
            !magicBytes ||
            !evmAddress) {
            throw new Error("Missing required input values");
        }
        __classPrivateFieldSet(this, _BridgeScriptData_userKey, userKey, "f");
        __classPrivateFieldSet(this, _BridgeScriptData_covenantKeys, covenantKeys, "f");
        __classPrivateFieldSet(this, _BridgeScriptData_covenantThreshold, covenantThreshold, "f");
        __classPrivateFieldSet(this, _BridgeScriptData_transferTimeLock, transferTimeLock, "f");
        __classPrivateFieldSet(this, _BridgeScriptData_magicBytes, magicBytes, "f");
        __classPrivateFieldSet(this, _BridgeScriptData_evmAddress, evmAddress, "f");
        // Run the validate method to check if the provided script data is valid
        if (!this.validate()) {
            throw new Error("Invalid script data provided");
        }
    }
    validate() {
        if (__classPrivateFieldGet(this, _BridgeScriptData_userKey, "f").length != exports.PK_LENGTH) {
            return false;
        }
        if (__classPrivateFieldGet(this, _BridgeScriptData_covenantKeys, "f").some((covenantKey) => covenantKey.length != exports.PK_LENGTH)) {
            return false;
        }
        if (__classPrivateFieldGet(this, _BridgeScriptData_transferTimeLock, "f") > 65535) {
            return false;
        }
        if (__classPrivateFieldGet(this, _BridgeScriptData_evmAddress, "f").length != exports.ETH_PK_LENGTH) {
            return false;
        }
        return true;
    }
    buildTimelockScript(timelock) {
        return bitcoinjs_lib_1.script.compile([
            __classPrivateFieldGet(this, _BridgeScriptData_userKey, "f"),
            bitcoinjs_lib_1.opcodes.OP_CHECKSIGVERIFY,
            bitcoinjs_lib_1.script.number.encode(timelock),
            bitcoinjs_lib_1.opcodes.OP_CHECKSEQUENCEVERIFY
        ]);
    }
    buildTransferTimeLockScript() {
        return this.buildTimelockScript(__classPrivateFieldGet(this, _BridgeScriptData_transferTimeLock, "f"));
    }
    buildTransferScript() {
        return __classPrivateFieldGet(this, _BridgeScriptData_instances, "m", _BridgeScriptData_buildMultiKeyScript).call(this, __classPrivateFieldGet(this, _BridgeScriptData_covenantKeys, "f"), __classPrivateFieldGet(this, _BridgeScriptData_covenantThreshold, "f"), false);
    }
    buildProvablyNoteScript() {
        const version = Buffer.alloc(1);
        version.writeUInt8(0);
        const serializedDepositData = Buffer.concat([
            __classPrivateFieldGet(this, _BridgeScriptData_magicBytes, "f"),
            version,
            __classPrivateFieldGet(this, _BridgeScriptData_userKey, "f"),
            __classPrivateFieldGet(this, _BridgeScriptData_evmAddress, "f") // Added the EVM address buffer here
        ]);
        return bitcoinjs_lib_1.script.compile([bitcoinjs_lib_1.opcodes.OP_RETURN, serializedDepositData]);
    }
    buildScripts() {
        return {
            timelockScript: this.buildTransferTimeLockScript(),
            provablyNoteScript: this.buildProvablyNoteScript(),
            transferScript: this.buildTransferScript()
        };
    }
}
exports.BridgeScriptData = BridgeScriptData;
_BridgeScriptData_userKey = new WeakMap(), _BridgeScriptData_covenantKeys = new WeakMap(), _BridgeScriptData_covenantThreshold = new WeakMap(), _BridgeScriptData_transferTimeLock = new WeakMap(), _BridgeScriptData_magicBytes = new WeakMap(), _BridgeScriptData_evmAddress = new WeakMap(), _BridgeScriptData_instances = new WeakSet(), _BridgeScriptData_buildSingleKeyScript = function _BridgeScriptData_buildSingleKeyScript(pk, withVerify) {
    // Check public key length
    if (pk.length != exports.PK_LENGTH) {
        throw new Error("Invalid key length");
    }
    return bitcoinjs_lib_1.script.compile([
        pk,
        withVerify ? bitcoinjs_lib_1.opcodes.OP_CHECKSIGVERIFY : bitcoinjs_lib_1.opcodes.OP_CHECKSIG
    ]);
}, _BridgeScriptData_buildMultiKeyScript = function _BridgeScriptData_buildMultiKeyScript(pks, threshold, withVerify) {
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
        return __classPrivateFieldGet(this, _BridgeScriptData_instances, "m", _BridgeScriptData_buildSingleKeyScript).call(this, pks[0], withVerify);
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
