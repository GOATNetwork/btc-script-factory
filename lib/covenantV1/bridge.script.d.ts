/// <reference types="node" />
/**
 * Constructs a deposit script for validating transactions.
 * This script is designed to verify deposits by checking the signature against the user's public key.
 * @param {Buffer} evmAddress - The EVM address of the user.
 * @param {Buffer} posPubkey - The public key of the user.
 * @return {Buffer} - The compiled script buffer ready for use in blockchain transactions.
 */
export declare function buildDepositScript(evmAddress: Buffer, posPubkey: Buffer): Buffer;
/**
 * Builds a data embedding script.
 * @param {Buffer} magicBytes - Magic bytes, length of 4 bytes.
 * @param {Buffer} depositorKey - Depositor's public key, length of 33 bytes.
 * @param {Buffer} evmAddress - EVM address, length of 20 bytes.
 * @return {Buffer} Compiled script.
 */
export declare function buildDataEmbedScript(magicBytes: Buffer, depositorKey: Buffer, evmAddress: Buffer): Buffer;
/**
 * Parses a data embedding script.
 * @param {Buffer} dataEmbedScript - The data embedding script to parse.
 * @return {Object} Parsed data including magicBytes, version, depositorKey, and evmAddress.
 */
export declare function parseDataEmbedScript(dataEmbedScript: Buffer): {
    magicBytes: Buffer;
    version: number;
    depositorKey: Buffer;
    evmAddress: Buffer;
};
