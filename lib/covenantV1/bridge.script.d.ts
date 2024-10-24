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
 * Assumes little-endian byte order for multi-byte values.
 * @param {Buffer} magicBytes - Magic bytes, length of 4 bytes.
 * @param {Buffer} evmAddress - EVM address, length of 20 bytes.
 * @return {Buffer} Compiled script.
 */
export declare function buildDataEmbedScript(magicBytes: Buffer, evmAddress: Buffer): Buffer;
/**
 * Parses a data embedding script.
 * Assumes little-endian byte order for multi-byte values.
 * @param {Buffer} dataEmbedScript - The data embedding script to parse.
 * @return {Object} Parsed data including magicBytes and evmAddress.
 */
export declare function parseDataEmbedScript(dataEmbedScript: Buffer): {
    magicBytes: Buffer;
    evmAddress: Buffer;
};
