import { script, opcodes } from "bitcoinjs-lib";
import { ETH_PK_LENGTH, PK_LENGTH } from "../constants";

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
    console.log(evmAddress.length, delegatorKey.length, validatorKey.length)
    throw new Error("Invalid input lengths");
  }
  if (typeof transferTimeLock !== "number" || transferTimeLock < 0 || transferTimeLock > 65535 ||
    typeof validatorIndex !== "number" || validatorIndex < 0 || validatorIndex > 4294967295 ||
    typeof nonce !== "number" || nonce < 0 || nonce > 4294967295) {
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
