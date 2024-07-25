"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStakingScript = exports.buildDepositScript = exports.ETH_PK_LENGTH = exports.PK_LENGTH = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
exports.PK_LENGTH = 32;
exports.ETH_PK_LENGTH = 20;
/**
 * Constructs a deposit script for validating transactions.
 * This script is designed to verify deposits by checking the signature against the user's public key.
 * @param {Buffer} evmAddress - The EVM address of the user.
 * @param {Buffer} posPubkey - The public key of the user.
 * @return {Buffer} - The compiled script buffer ready for use in blockchain transactions.
 */
function buildDepositScript(evmAddress, posPubkey) {
    if (!Buffer.isBuffer(evmAddress) || !Buffer.isBuffer(posPubkey)) {
        throw new Error("Invalid input types");
    }
    if (evmAddress.length !== exports.ETH_PK_LENGTH) {
        throw new Error("Invalid EVM address length");
    }
    return bitcoinjs_lib_1.script.compile([
        evmAddress,
        bitcoinjs_lib_1.opcodes.OP_DROP,
        posPubkey,
        bitcoinjs_lib_1.opcodes.OP_CHECKSIG
    ]);
}
exports.buildDepositScript = buildDepositScript;
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
function buildStakingScript(evmAddress, delegatorKey, validatorKey, transferTimeLock, validatorIndex, nonce) {
    if (!Buffer.isBuffer(evmAddress) || !Buffer.isBuffer(delegatorKey) || !Buffer.isBuffer(validatorKey)) {
        throw new Error("Invalid input types");
    }
    if (evmAddress.length !== exports.ETH_PK_LENGTH || delegatorKey.length !== exports.PK_LENGTH || validatorKey.length !== exports.PK_LENGTH) {
        throw new Error("Invalid input lengths");
    }
    if (typeof transferTimeLock !== "number" || transferTimeLock > 65535 || typeof validatorIndex !== "number" || typeof nonce !== "number") {
        throw new Error("Invalid numeric inputs");
    }
    // Combine validatorIndex and nonce into a single Buffer
    const combineBytes = Buffer.concat([
        Buffer.alloc(4, validatorIndex), // Ensure 4 bytes for validatorIndex
        Buffer.alloc(4, nonce) // Ensure 4 bytes for nonce
    ]);
    return bitcoinjs_lib_1.script.compile([
        bitcoinjs_lib_1.opcodes.OP_DUP,
        evmAddress,
        bitcoinjs_lib_1.opcodes.OP_EQUAL,
        bitcoinjs_lib_1.opcodes.OP_IF,
        bitcoinjs_lib_1.opcodes.OP_DROP,
        bitcoinjs_lib_1.script.number.encode(transferTimeLock),
        bitcoinjs_lib_1.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoinjs_lib_1.opcodes.OP_DROP,
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
exports.buildStakingScript = buildStakingScript;
