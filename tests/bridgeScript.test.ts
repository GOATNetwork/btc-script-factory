import { buildDepositScript } from "../src/covenantV1/utils/bridge.script";
import { script, opcodes } from "bitcoinjs-lib";

describe("bridgeScript", () => {
  const posKey = "d6ce14162f3954bac0fff55a12b6df7d614801f358b5d910fe7986a47102e657";
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
    const invalidPosKeyBuffer = Buffer.from("d6ce14162f3954bac0fff55a12b6df7d614801f358b5d910fe7986a47102e65", "hex"); // One byte less

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
