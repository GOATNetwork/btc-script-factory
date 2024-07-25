import { script, opcodes } from "bitcoinjs-lib";

export const PK_LENGTH = 32;
export const ETH_PK_LENGTH = 20;

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

  return script.compile([
    evmAddress,
    opcodes.OP_DROP,
    posPubkey,
    opcodes.OP_CHECKSIG
  ]);
}

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
export function buildStakingScript(
  evmAddress: Buffer,
  delegatorKey: Buffer,
  validatorKey: Buffer,
  transferTimeLock: number,
  validatorIndex: number,
  nonce: number
): Buffer {
  if (!Buffer.isBuffer(evmAddress) || !Buffer.isBuffer(delegatorKey) || !Buffer.isBuffer(validatorKey)) {
    throw new Error("Invalid input types");
  }
  if (evmAddress.length !== ETH_PK_LENGTH || delegatorKey.length !== PK_LENGTH || validatorKey.length !== PK_LENGTH) {
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

  return script.compile([
    opcodes.OP_DUP,
    evmAddress,
    opcodes.OP_EQUAL,
    opcodes.OP_IF,
      opcodes.OP_DROP,
      script.number.encode(transferTimeLock),
      opcodes.OP_CHECKSEQUENCEVERIFY,
      opcodes.OP_DROP,
      delegatorKey,
      opcodes.OP_CHECKSIG,
    opcodes.OP_ELSE,
      combineBytes,
      opcodes.OP_EQUALVERIFY,
      opcodes.OP_2,
      validatorKey,
      delegatorKey,
      opcodes.OP_2,
      opcodes.OP_CHECKMULTISIG,
    opcodes.OP_ENDIF
  ]);
}
