import { buildStakingScript } from "../src/covenantV1/utils/staking.script";
import { script, opcodes } from "bitcoinjs-lib";

describe("stakingScript", () => {
  const delegatorKey = "9261bdf7033ba64b2e0a9941ace9923b168c6a182ce37aa35fd16c0076d6aa19";
  const ownerEvmAddress = "0x2915fd8beebdc822887deceac3dfe1540fac9c81";
  const validatorKey = "b012d9b1e987edc302d1e72ebc3c2910c1b4e9f8cd1f3b11f4686c41c7ef6db5";
  const validatorNodeIndex = 0xef921bb0;
  const nonce = 0x537d5579;
  const lockBlockNumber = 0x02;

  it("should build a valid staking script", () => {
    const evmAddressBuffer = ownerEvmAddress.startsWith("0x") ?
      Buffer.from(ownerEvmAddress.slice(2), "hex") :
      Buffer.from(ownerEvmAddress, "hex");
    const delegatorPubkeyBuffer = Buffer.from(delegatorKey, "hex");
    const validatorPubkeyBuffer = Buffer.from(validatorKey, "hex");

    const stakingScript = buildStakingScript(
      evmAddressBuffer,
      delegatorPubkeyBuffer,
      validatorPubkeyBuffer,
      lockBlockNumber,
      validatorNodeIndex,
      nonce
    );

    // Expected script components
    const combineBytes = Buffer.concat([
      Buffer.alloc(4, validatorNodeIndex),
      Buffer.alloc(4, nonce)
    ]);

    const expectedScript = script.compile([
      opcodes.OP_DUP,
      evmAddressBuffer,
      opcodes.OP_EQUAL,
      opcodes.OP_IF,
      opcodes.OP_DROP,
      script.number.encode(lockBlockNumber),
      opcodes.OP_CHECKSEQUENCEVERIFY,
      opcodes.OP_DROP,
      delegatorPubkeyBuffer,
      opcodes.OP_CHECKSIG,
      opcodes.OP_ELSE,
      combineBytes,
      opcodes.OP_EQUALVERIFY,
      opcodes.OP_2,
      validatorPubkeyBuffer,
      delegatorPubkeyBuffer,
      opcodes.OP_2,
      opcodes.OP_CHECKMULTISIG,
      opcodes.OP_ENDIF
    ]);

    // Check if the generated script matches the expected script
    expect(stakingScript.equals(expectedScript)).toBe(true);
  });

  it("should throw an error for invalid EVM address length", () => {
    const invalidEvmAddressBuffer = Buffer.from("2915fd8beebdc822887deceac3dfe1540fac9c8", "hex"); // One byte less

    expect(() => buildStakingScript(
      invalidEvmAddressBuffer,
      Buffer.from(delegatorKey, "hex"),
      Buffer.from(validatorKey, "hex"),
      lockBlockNumber,
      validatorNodeIndex,
      nonce
    )).toThrow("Invalid input lengths");
  });

  it("should throw an error for invalid public key length", () => {
    const invalidDelegatorKeyBuffer = Buffer.from("9261bdf7033ba64b2e0a9941ace9923b168c6a182ce37aa35fd16c0076d6aa", "hex"); // One byte less

    expect(() => buildStakingScript(
      Buffer.from(ownerEvmAddress.slice(2), "hex"),
      invalidDelegatorKeyBuffer,
      Buffer.from(validatorKey, "hex"),
      lockBlockNumber,
      validatorNodeIndex,
      nonce
    )).toThrow("Invalid input lengths");
  });

  it("should throw an error for invalid input types", () => {
    // @ts-ignore
    expect(() => buildStakingScript("invalidAddress", Buffer.from(delegatorKey, "hex"), Buffer.from(validatorKey, "hex"), lockBlockNumber, validatorNodeIndex, nonce))
    .toThrow("Invalid input types");

    // @ts-ignore
    expect(() => buildStakingScript(Buffer.from(ownerEvmAddress.slice(2), "hex"), "invalidDelegatorKey", Buffer.from(validatorKey, "hex"), lockBlockNumber, validatorNodeIndex, nonce))
    .toThrow("Invalid input types");

    // @ts-ignore
    expect(() => buildStakingScript(Buffer.from(ownerEvmAddress.slice(2), "hex"), Buffer.from(delegatorKey, "hex"), "invalidValidatorKey", lockBlockNumber, validatorNodeIndex, nonce))
    .toThrow("Invalid input types");
  });

  it("should throw an error for invalid numeric inputs", () => {
    expect(() => buildStakingScript(
      Buffer.from(ownerEvmAddress.slice(2), "hex"),
      Buffer.from(delegatorKey, "hex"),
      Buffer.from(validatorKey, "hex"),
      -1, // Invalid transferTimeLock
      validatorNodeIndex,
      nonce
    )).toThrow("Invalid numeric inputs");

    expect(() => buildStakingScript(
      Buffer.from(ownerEvmAddress.slice(2), "hex"),
      Buffer.from(delegatorKey, "hex"),
      Buffer.from(validatorKey, "hex"),
      lockBlockNumber,
      -1, // Invalid validatorIndex
      nonce
    )).toThrow("Invalid numeric inputs");

    expect(() => buildStakingScript(
      Buffer.from(ownerEvmAddress.slice(2), "hex"),
      Buffer.from(delegatorKey, "hex"),
      Buffer.from(validatorKey, "hex"),
      lockBlockNumber,
      validatorNodeIndex,
      -1 // Invalid nonce
    )).toThrow("Invalid numeric inputs");
  });
});
