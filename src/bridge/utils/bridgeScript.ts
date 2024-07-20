import { script, opcodes } from "bitcoinjs-lib";

import { BridgeScripts } from "../types/BridgeScripts";

export const PK_LENGTH = 32;
export const ETH_PK_LENGTH = 20;

export class BridgeScriptData {
  #userKey: Buffer;
  #covenantKeys: Buffer[];
  #covenantThreshold: number;
  #transferTimeLock: number;
  #magicBytes: Buffer;
  #evmAddress: Buffer;

  constructor(
    userKey: Buffer,
    covenantKeys: Buffer[],
    covenantThreshold: number,
    transferTimeLock: number,
    magicBytes: Buffer,
    evmAddress: Buffer,
  ) {
    if (
      !userKey ||
      !covenantKeys ||
      !covenantThreshold ||
      !transferTimeLock ||
      !magicBytes ||
      !evmAddress
    ) {
      throw new Error("Missing required input values");
    }
    this.#userKey = userKey;
    this.#covenantKeys = covenantKeys;
    this.#covenantThreshold = covenantThreshold;
    this.#transferTimeLock = transferTimeLock;
    this.#magicBytes = magicBytes;
    this.#evmAddress = evmAddress;

    // Run the validate method to check if the provided script data is valid
    if (!this.validate()) {
      throw new Error("Invalid script data provided");
    }
  }

  validate(): boolean {
    if (this.#userKey.length != PK_LENGTH) {
      return false;
    }

    if (
      this.#covenantKeys.some((covenantKey) => covenantKey.length != PK_LENGTH)
    ) {
      return false;
    }

    if (this.#transferTimeLock > 65535) {
      return false;
    }

    if (this.#evmAddress.length != ETH_PK_LENGTH) {
      return false;
    }
    return true;
  }

  buildTimelockScript(timelock: number): Buffer {
    return script.compile([
      this.#userKey,
      opcodes.OP_CHECKSIGVERIFY,
      script.number.encode(timelock),
      opcodes.OP_CHECKSEQUENCEVERIFY,
    ]);
  }

  buildTransferTimeLockScript(): Buffer {
    return this.buildTimelockScript(this.#transferTimeLock);
  }

  buildTransferScript(): Buffer {
    return this.#buildMultiKeyScript(
      this.#covenantKeys,
      this.#covenantThreshold,
      false,
    );
  }

  buildDataEmbedScript(): Buffer {
    const version = Buffer.alloc(1);
    version.writeUInt8(0);

    const serializedDepositData = Buffer.concat([
      this.#magicBytes,
      version,
      this.#userKey,
      this.#evmAddress,  // Added the EVM address buffer here
    ]);

    return script.compile([opcodes.OP_RETURN, serializedDepositData]);
  }

  buildScripts(): BridgeScripts {
    return {
      timelockScript: this.buildTransferTimeLockScript(),
      dataEmbedScript: this.buildDataEmbedScript(),
      transferScript: this.buildTransferScript(),
    };
  }

  /**
   * Builds a single key script in the form:
   * buildSingleKeyScript creates a single key script
   *    <pk> OP_CHECKSIGVERIFY (if withVerify is true)
   *    <pk> OP_CHECKSIG (if withVerify is false)
   * @param pk - The public key buffer.
   * @param withVerify - A boolean indicating whether to include the OP_CHECKSIGVERIFY opcode.
   * @returns The compiled script buffer.
   */
  #buildSingleKeyScript(pk: Buffer, withVerify: boolean): Buffer {
    // Check public key length
    if (pk.length != PK_LENGTH) {
      throw new Error("Invalid key length");
    }
    return script.compile([
      pk,
      withVerify ? opcodes.OP_CHECKSIGVERIFY : opcodes.OP_CHECKSIG,
    ]);
  }

  /**
   * Builds a multi-key script in the form:
   *    <pk1> OP_CHEKCSIG <pk2> OP_CHECKSIGADD <pk3> OP_CHECKSIGADD ... <pkN> OP_CHECKSIGADD <threshold> OP_NUMEQUAL
   *    <withVerify -> OP_NUMEQUALVERIFY>
   * It validates whether provided keys are unique and the threshold is not greater than number of keys
   * If there is only one key provided it will return single key sig script
   * @param pks - An array of public keys.
   * @param threshold - The required number of valid signers.
   * @param withVerify - A boolean indicating whether to include the OP_VERIFY opcode.
   * @returns The compiled multi-key script as a Buffer.
   * @throws {Error} If no keys are provided, if the required number of valid signers is greater than the number of provided keys, or if duplicate keys are provided.
   */
  #buildMultiKeyScript(
    pks: Buffer[],
    threshold: number,
    withVerify: boolean,
  ): Buffer {
    // Verify that pks is not empty
    if (!pks || pks.length === 0) {
      throw new Error("No keys provided");
    }
    // Check buffer object have expected lengths like checking pks.length
    if (pks.some((pk) => pk.length != PK_LENGTH)) {
      throw new Error("Invalid key length");
    }
    // Verify that threshold <= len(pks)
    if (threshold > pks.length) {
      throw new Error(
        "Required number of valid signers is greater than number of provided keys",
      );
    }
    if (pks.length === 1) {
      return this.#buildSingleKeyScript(pks[0], withVerify);
    }
    // keys must be sorted
    const sortedPks = pks.sort(Buffer.compare);
    // verify there are no duplicates
    for (let i = 0; i < sortedPks.length - 1; ++i) {
      if (sortedPks[i].equals(sortedPks[i + 1])) {
        throw new Error("Duplicate keys provided");
      }
    }
    const scriptElements = [sortedPks[0], opcodes.OP_CHECKSIG];
    for (let i = 1; i < sortedPks.length; i++) {
      scriptElements.push(sortedPks[i]);
      scriptElements.push(opcodes.OP_CHECKSIGADD);
    }
    scriptElements.push(script.number.encode(threshold));
    if (withVerify) {
      scriptElements.push(opcodes.OP_NUMEQUALVERIFY);
    } else {
      scriptElements.push(opcodes.OP_NUMEQUAL);
    }
    return script.compile(scriptElements);
  }
}
