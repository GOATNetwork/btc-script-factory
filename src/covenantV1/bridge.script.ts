import { script, opcodes } from "bitcoinjs-lib";
import { ETH_PK_LENGTH, PK_LENGTH } from "../constants";

/**
 * Constructs a deposit script for validating transactions.
 * This script is designed to verify deposits by checking the signature against the user's public key.
 * @param {Buffer} evmAddress - The EVM address of the user.
 * @param {Buffer} posPubkey - The public key of the user.
 * @return {Buffer} - The compiled script buffer ready for use in blockchain transactions.
 */
export function buildDepositScript(evmAddress: Buffer, posPubkey: Buffer): Buffer {
  if (!Buffer.isBuffer(evmAddress) || !Buffer.isBuffer(posPubkey)) {
    throw new Error("Invalid input types");
  }
  if (evmAddress.length !== ETH_PK_LENGTH) {
    throw new Error("Invalid EVM address length");
  }
  if (posPubkey.length !== PK_LENGTH) {
    throw new Error("Invalid public key length");
  }

  return script.compile([
    evmAddress,
    opcodes.OP_DROP,
    posPubkey,
    opcodes.OP_CHECKSIG
  ]);
}

/**
 * Builds a data embedding script.
 * @param {Buffer} magicBytes - Magic bytes, length of 4 bytes.
 * @param {Buffer} depositorKey - Depositor's public key, length of 33 bytes.
 * @param {Buffer} evmAddress - EVM address, length of 20 bytes.
 * @return {Buffer} Compiled script.
 */
export function buildDataEmbedScript(magicBytes: Buffer, depositorKey: Buffer, evmAddress: Buffer): Buffer {
  // Parameter validation
  if (!Buffer.isBuffer(magicBytes) || magicBytes.length !== 4) {
    throw new Error("magicBytes must be a Buffer of length 4");
  }
  if (!Buffer.isBuffer(depositorKey) || depositorKey.length !== 33) {
    throw new Error("depositorKey must be a Buffer of length 33");
  }
  if (!Buffer.isBuffer(evmAddress) || evmAddress.length !== 20) {
    throw new Error("evmAddress must be a Buffer of length 20");
  }

  // 1 byte for version
  const version = Buffer.alloc(1);
  version.writeUInt8(0);

  const serializedStakingData = Buffer.concat([
    magicBytes,
    version,
    depositorKey,
    evmAddress
  ]);

  return script.compile([opcodes.OP_RETURN!, serializedStakingData]);
}

/**
 * Parses a data embedding script.
 * @param {Buffer} dataEmbedScript - The data embedding script to parse.
 * @return {Object} Parsed data including magicBytes, version, depositorKey, and evmAddress.
 */
export function parseDataEmbedScript(dataEmbedScript: Buffer) {
  const chunks = script.decompile(dataEmbedScript);

  if (!chunks || chunks[0] !== opcodes.OP_RETURN) {
    throw new Error("Invalid data embed script: Not OP_RETURN");
  }

  const embeddedData = chunks[1] as Buffer;
  if (!embeddedData) {
    throw new Error("No data found in OP_RETURN output");
  }

  const magicBytes = embeddedData.slice(0, 4); // magicBytes
  const version = embeddedData.readUInt8(4); // version
  const depositorKey = embeddedData.slice(5, 38); // depositor publicKey
  const evmAddress = embeddedData.slice(38); // evmAddress

  return {
    magicBytes,
    version,
    depositorKey,
    evmAddress
  };
}
