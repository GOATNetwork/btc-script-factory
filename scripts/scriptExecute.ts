import { payments, script, Transaction, opcodes, networks } from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";

const ECPair = ECPairFactory(ecc);

function decodeHex(hexString: string): Buffer {
  return Buffer.from(hexString, "hex");
}

async function main() {
  const network = networks.regtest;

  const tssGroupKey = ECPair.fromPrivateKey(decodeHex("d6ce14162f3954bac0fff55a12b6df7d614801f358b5d910fe7986a47102e657"));
  const delegatorKey = ECPair.fromPrivateKey(decodeHex("9261bdf7033ba64b2e0a9941ace9923b168c6a182ce37aa35fd16c0076d6aa19"));

  const commitment = decodeHex("2915fd8beebdc822887deceac3dfe1540fac9c81ef921bb0537d5579");
  const evmAddress = commitment.slice(0, 20);
  const validatorNodeIndex = commitment.slice(20, 24);
  const nonce = commitment.slice(24);

  const blockLockNumber = 2;

  const redeemScript = script.compile([
    opcodes.OP_DUP,
    opcodes.OP_HASH160,
    evmAddress,
    opcodes.OP_EQUALVERIFY,
    opcodes.OP_CHECKSIG,
    opcodes.OP_IF,
    script.number.encode(blockLockNumber),
    opcodes.OP_CHECKSEQUENCEVERIFY,
    opcodes.OP_DROP,
    delegatorKey.publicKey,
    opcodes.OP_CHECKSIG,
    opcodes.OP_ELSE,
    Buffer.concat([validatorNodeIndex, nonce]),
    opcodes.OP_2,
    tssGroupKey.publicKey,
    delegatorKey.publicKey,
    opcodes.OP_2,
    opcodes.OP_CHECKMULTISIG,
    opcodes.OP_ENDIF
  ]);

  const p2wsh = payments.p2wsh({
    redeem: { output: redeemScript, network },
    network
  });

  const tx = new Transaction();
  const prevTxId = "910737c235a7d615d0a78399f8b7efde29b65c3b916377afb5439f61291defd6";
  const prevTxout = 0;
  const prevAmountSat = 1e8; // 1 BTC in satoshis

  tx.addInput(Buffer.from(prevTxId, "hex").reverse(), prevTxout, blockLockNumber, p2wsh.output!);

  const delegatorAddress = payments.p2wpkh({
    pubkey: delegatorKey.publicKey,
    network
  });

  const curAmountSat = prevAmountSat - 1e3; // Subtracting a small fee
  tx.addOutput(delegatorAddress.output!, curAmountSat);

  // Prepare the witness stack manually
  const witnessStack = [];
  const signatureHash = tx.hashForWitnessV0(0, redeemScript, prevAmountSat, Transaction.SIGHASH_ALL);
  const signature = delegatorKey.sign(signatureHash);
  const signatureWithHashType = Buffer.concat([signature, Buffer.from([Transaction.SIGHASH_ALL])]);

  witnessStack.push(signatureWithHashType);
  witnessStack.push(delegatorKey.publicKey);
  witnessStack.push(redeemScript);

  tx.setWitness(0, witnessStack);

  console.log("Redeem script:", redeemScript.toString("hex"));
  console.log("P2WSH address:", p2wsh.address);
  console.log("Transaction ID:", tx.getId());
  console.log("Raw Transaction:", tx.toHex());
}

main().catch(console.error);
