"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDepositScript = buildDepositScript;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const constants_1 = require("../constants");
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
    if (evmAddress.length !== constants_1.ETH_PK_LENGTH) {
        throw new Error("Invalid EVM address length");
    }
    if (posPubkey.length !== constants_1.PK_LENGTH) {
        throw new Error("Invalid public key length");
    }
    return bitcoinjs_lib_1.script.compile([
        evmAddress,
        bitcoinjs_lib_1.opcodes.OP_DROP,
        posPubkey,
        bitcoinjs_lib_1.opcodes.OP_CHECKSIG
    ]);
}
