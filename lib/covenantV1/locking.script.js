"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLockingScript = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const constants_1 = require("../constants");
const bip68 = require("bip68");
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
function buildLockingScript(evmAddress, delegatorKey, validatorKey, transferTimeLock, validatorIndex, nonce) {
    if (!Buffer.isBuffer(evmAddress) || !Buffer.isBuffer(delegatorKey) || !Buffer.isBuffer(validatorKey) || !Buffer.isBuffer(nonce) || !Buffer.isBuffer(validatorIndex)) {
        throw new Error("Invalid input types");
    }
    if (evmAddress.length !== constants_1.ETH_PK_LENGTH || delegatorKey.length !== constants_1.PK_LENGTH || validatorKey.length !== constants_1.PK_LENGTH) {
        throw new Error("Invalid input lengths");
    }
    if (typeof transferTimeLock !== "number" || transferTimeLock < 0 || transferTimeLock > 65535) {
        throw new Error("Invalid numeric inputs");
    }
    if (validatorIndex.length !== 4) {
        throw new Error("Invalid validatorIndex input");
    }
    if (nonce.length !== 4) {
        throw new Error("Invalid nonce input");
    }
    // Combine validatorIndex and nonce into a single Buffer
    const combineBytes = Buffer.concat([
        validatorIndex,
        nonce
    ]);
    const sequence = bip68.encode({ blocks: transferTimeLock });
    return bitcoinjs_lib_1.script.compile([
        bitcoinjs_lib_1.opcodes.OP_DUP,
        evmAddress,
        bitcoinjs_lib_1.opcodes.OP_EQUAL,
        bitcoinjs_lib_1.opcodes.OP_IF,
        bitcoinjs_lib_1.opcodes.OP_DROP, // Drop the result of OP_EQUAL
        bitcoinjs_lib_1.script.number.encode(sequence),
        bitcoinjs_lib_1.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoinjs_lib_1.opcodes.OP_DROP, // Drop the sequence number left by encode(sequence)
        delegatorKey,
        bitcoinjs_lib_1.opcodes.OP_CHECKSIG,
        bitcoinjs_lib_1.opcodes.OP_ELSE,
        combineBytes,
        bitcoinjs_lib_1.opcodes.OP_EQUALVERIFY,
        bitcoinjs_lib_1.opcodes.OP_2,
        validatorKey,
        delegatorKey,
        bitcoinjs_lib_1.opcodes.OP_2,
        bitcoinjs_lib_1.opcodes.OP_CHECKMULTISIG,
        bitcoinjs_lib_1.opcodes.OP_ENDIF
    ]);
}
exports.buildLockingScript = buildLockingScript;
