import { buildStakingScript } from "../src/covenantV1/staking.script";
import { script, opcodes } from "bitcoinjs-lib";

describe("stakingScript", () => {
  const delegatorKey = "023d02b47df037a43cb4354c72f162da99f5bd558209ca851816ca9170fe291da7";
  const ownerEvmAddress = "0x2915fd8beebdc822887deceac3dfe1540fac9c81";
  const validatorKey = "031944507b30d7a911d12532732e4877ed41b9f05fe2242df22e045436354a077b";
  const validatorNodeIndex = Buffer.from("ef921bb0", "hex");
  const nonce = Buffer.from("537d5579", "hex");
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
      validatorNodeIndex,
      nonce
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
    const invalidDelegatorKeyBuffer = Buffer.from("03fad0b79ac24e20a251a0fea9231c382ad5a19e07584d0a5b8f81807df20ccba2".slice(4), "hex"); // One byte less

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
      Buffer.from("1", "hex"), // Invalid validatorIndex
      nonce
    )).toThrow("Invalid validatorIndex input");

    expect(() => buildStakingScript(
      Buffer.from(ownerEvmAddress.slice(2), "hex"),
      Buffer.from(delegatorKey, "hex"),
      Buffer.from(validatorKey, "hex"),
      lockBlockNumber,
      validatorNodeIndex,
      Buffer.from("1", "hex") // Invalid nonce
    )).toThrow("Invalid nonce input");
  });
});
