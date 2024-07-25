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
