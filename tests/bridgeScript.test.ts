import { buildDepositScript } from "../src/covenantV1/utils/bridge.script";
import { script, opcodes } from "bitcoinjs-lib";

describe("bridgeScript", () => {
  const posKey = "03fad0b79ac24e20a251a0fea9231c382ad5a19e07584d0a5b8f81807df20ccba2";
  const ownerEvmAddress = "0x2915fd8beebdc822887deceac3dfe1540fac9c81";

  it("should build a valid deposit script", () => {
    const evmAddressBuffer = ownerEvmAddress.startsWith("0x") ?
      Buffer.from(ownerEvmAddress.slice(2), "hex") :
      Buffer.from(ownerEvmAddress, "hex");
    const posPubkeyBuffer = Buffer.from(posKey, "hex");

    const depositScript = buildDepositScript(evmAddressBuffer, posPubkeyBuffer);

    // Expected script components
    const expectedScript = script.compile([
      evmAddressBuffer,
      opcodes.OP_DROP,
      posPubkeyBuffer,
      opcodes.OP_CHECKSIG
    ]);

    // Check if the generated script matches the expected script
    expect(depositScript.equals(expectedScript)).toBe(true);
  });

  it("should throw an error for invalid EVM address length", () => {
    const invalidEvmAddressBuffer = Buffer.from("2915fd8beebdc822887deceac3dfe1540fac9c8", "hex"); // One byte less

    expect(() => buildDepositScript(invalidEvmAddressBuffer, Buffer.from(posKey, "hex")))
    .toThrow("Invalid EVM address length");
  });

  it("should throw an error for invalid public key length", () => {
    const invalidPosKeyBuffer = Buffer.from("03cb33468228c4c01f8d2abb1377a28309a02bf1cfb76105f52dc4ef247a0b15b2".slice(4), "hex"); // One byte less

    expect(() => buildDepositScript(Buffer.from(ownerEvmAddress.slice(2), "hex"), invalidPosKeyBuffer))
    .toThrow("Invalid public key length");
  });

  it("should throw an error for invalid input types", () => {
    // @ts-ignore
    expect(() => buildDepositScript(ownerEvmAddress, Buffer.from(posKey, "hex")))
    .toThrow("Invalid input types");
    // @ts-ignore
    expect(() => buildDepositScript(Buffer.from(ownerEvmAddress.slice(2), "hex"), posKey))
    .toThrow("Invalid input types");
  });
});
