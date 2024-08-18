import { opcodes, script } from "bitcoinjs-lib";
import { ETH_PK_LENGTH, PK_LENGTH } from "../constants";
// @ts-ignore
import bip68 from "bip68";

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
export function buildLockingScript(
  evmAddress: Buffer,
  delegatorKey: Buffer,
  validatorKey: Buffer,
  transferTimeLock: number,
  validatorIndex: Buffer,
  nonce: Buffer
): Buffer {
  if (!Buffer.isBuffer(evmAddress) || !Buffer.isBuffer(delegatorKey) || !Buffer.isBuffer(validatorKey) || !Buffer.isBuffer(nonce) || !Buffer.isBuffer(validatorIndex)) {
    throw new Error("Invalid input types");
  }
  if (evmAddress.length !== ETH_PK_LENGTH || delegatorKey.length !== PK_LENGTH || validatorKey.length !== PK_LENGTH) {
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

  return script.compile([
    opcodes.OP_DUP,
    evmAddress,
    opcodes.OP_EQUAL,
    opcodes.OP_IF,
      opcodes.OP_DROP, // Drop the result of OP_EQUAL
      script.number.encode(transferTimeLock),
      opcodes.OP_CHECKSEQUENCEVERIFY,
      opcodes.OP_DROP, // Drop the sequence number left by encode(sequence)
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
  ])
}
