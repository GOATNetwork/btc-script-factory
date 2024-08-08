import { script, opcodes } from "bitcoinjs-lib";

import { StakingScripts } from "../../types/StakingScripts";

// PK_LENGTH denotes the length of a public key in bytes
export const PK_LENGTH = 32;

// StakingScriptData is a class that holds the data required for the BTC Staking Script
// and exposes methods for converting it into useful formats
export class StakingScriptData {
  #stakerKey: Buffer;
  #covenantKeys: Buffer[];
  #covenantThreshold: number;
  #stakingTimeLock: number;
  #unbondingTimeLock: number;
  #magicBytes: Buffer;

  constructor(
    // The `stakerKey` is the public key of the staker without the coordinate bytes.
    stakerKey: Buffer,
    // A list of the public keys without the coordinate bytes corresponding to
    // the covenant emulators.
    // This is a parameter of the goat system and should be retrieved from there.
    covenantKeys: Buffer[],
    // The number of covenant emulator signatures required for a transaction
    // to be valid.
    // This is a parameter of the goat system and should be retrieved from there.
    covenantThreshold: number,
    // The staking period denoted as a number of BTC blocks.
    stakingTimelock: number,
    // The unbonding period denoted as a number of BTC blocks.
    // This value should be more than equal than the minimum unbonding time of the
    // goat system.
    unbondingTimelock: number,
    // The magic bytes used to identify the staking transaction on goat
    // through the data return script
    magicBytes: Buffer
  ) {
    // Check that required input values are not missing when creating an instance of the StakingScriptData class
    if (
      !stakerKey ||
      !covenantKeys ||
      !covenantThreshold ||
      !stakingTimelock ||
      !unbondingTimelock ||
      !magicBytes
    ) {
      throw new Error("Missing required input values");
    }
    this.#stakerKey = stakerKey;
    this.#covenantKeys = covenantKeys;
    this.#covenantThreshold = covenantThreshold;
    this.#stakingTimeLock = stakingTimelock;
    this.#unbondingTimeLock = unbondingTimelock;
    this.#magicBytes = magicBytes;

    // Run the validate method to check if the provided script data is valid
    if (!this.validate()) {
      throw new Error("Invalid script data provided");
    }
  }

  /**
   * Validates the staking script.
   * @return {boolean} Returns true if the staking script is valid, otherwise false.
   */
  validate(): boolean {
    // check that staker key is the correct length
    if (this.#stakerKey.length != PK_LENGTH) {
      return false;
    }
    // check that covenant keys are the correct length
    if (
      this.#covenantKeys.some((covenantKey) => covenantKey.length != PK_LENGTH)
    ) {
      return false;
    }
    // check that maximum value for staking time is not greater than uint16
    if (this.#stakingTimeLock > 65535) {
      return false;
    }
    return true;
  }

  /**
   * Builds a timelock script.
   * @param {number} timelock - The timelock value to encode in the script.
   * @return {Buffer} containing the compiled timelock script.
   */
  buildTimelockScript(timelock: number): Buffer {
    return script.compile([
      this.#stakerKey,
      opcodes.OP_CHECKSIGVERIFY,
      script.number.encode(timelock),
      opcodes.OP_CHECKSEQUENCEVERIFY
    ]);
  }

  /**
   * Builds the staking timelock script.
   * Only holder of private key for given pubKey can spend after relative lock time
   * Creates the timelock script in the form:
   *    <stakerPubKey>
   *    OP_CHECKSIGVERIFY
   *    <stakingTimeBlocks>
   *    OP_CHECKSEQUENCEVERIFY
   * @return {Buffer} The staking timelock script.
   */
  buildStakingTimelockScript(): Buffer {
    return this.buildTimelockScript(this.#stakingTimeLock);
  }

  /**
   * Builds the unbonding timelock script.
   * Creates the unbonding timelock script in the form:
   *    <stakerPubKey>
   *    OP_CHECKSIGVERIFY
   *    <unbondingTimeBlocks>
   *    OP_CHECKSEQUENCEVERIFY
   * @return {Buffer} The unbonding timelock script.
   */
  buildUnbondingTimelockScript(): Buffer {
    return this.buildTimelockScript(this.#unbondingTimeLock);
  }

  /**
   * Builds the unbonding script in the form:
   *    buildSingleKeyScript(stakerPk, true) ||
   *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
   *    || means combining the scripts
   * @return {Buffer} The unbonding script.
   */
  buildUnbondingScript(): Buffer {
    return Buffer.concat([
      this.#buildSingleKeyScript(this.#stakerKey, true),
      this.#buildMultiKeyScript(
        this.#covenantKeys,
        this.#covenantThreshold,
        false
      )
    ]);
  }

  /**
   * Builds the slashing script for staking in the form:
   *    buildSingleKeyScript(stakerPk, true) ||
   *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
   *    || means combining the scripts
   * The slashing script is a combination of single-key and multi-key scripts.
   * The single-key script is used for staker key verification.
   * The multi-key script is used for covenant key verification.
   * @return {Buffer} The slashing script as a Buffer.
   */
  buildSlashingScript(): Buffer {
    return Buffer.concat([
      this.#buildSingleKeyScript(this.#stakerKey, true),
      this.#buildMultiKeyScript(
        this.#covenantKeys,
        this.#covenantThreshold,
        // No need to add verify since covenants are at the end of the script
        false
      )
    ]);
  }

  /**
   * Builds a data script for staking in the form:
   *    OP_RETURN || <serializedStakingData>
   * where serializedStakingData is the concatenation of:
   *    MagicBytes || Version || StakerPublicKey || StakingTimeLock
   * @return {Buffer} The compiled provably note script.
   */
  buildProvablyNoteScript(): Buffer {
    // 1 byte for version
    const version = Buffer.alloc(1);
    version.writeUInt8(0);
    // 2 bytes for staking time
    const stakingTimeLock = Buffer.alloc(2);
    // big endian
    stakingTimeLock.writeUInt16BE(this.#stakingTimeLock);
    const serializedStakingData = Buffer.concat([
      this.#magicBytes,
      version,
      this.#stakerKey,
      stakingTimeLock
    ]);
    return script.compile([opcodes.OP_RETURN, serializedStakingData]);
  }

  /**
   * Builds the staking scripts.
   * @return {StakingScripts} The staking scripts.
   */
  buildScripts(): StakingScripts {
    return {
      timelockScript: this.buildStakingTimelockScript(),
      unbondingScript: this.buildUnbondingScript(),
      slashingScript: this.buildSlashingScript(),
      unbondingTimelockScript: this.buildUnbondingTimelockScript(),
      provablyNoteScript: this.buildProvablyNoteScript()
    };
  }

  // buildSingleKeyScript and buildMultiKeyScript allow us to reuse functionality
  // for creating Bitcoin scripts for the unbonding script and the slashing script

  /**
   * Builds a single key script in the form:
   * buildSingleKeyScript creates a single key script
   *    <pk> OP_CHECKSIGVERIFY (if withVerify is true)
   *    <pk> OP_CHECKSIG (if withVerify is false)
   * @param {Buffer} pk - The public key buffer.
   * @param {boolean} withVerify - A boolean indicating whether to include the OP_CHECKSIGVERIFY opcode.
   * @returns {Buffer} The compiled script buffer.
   */

  #buildSingleKeyScript(pk: Buffer, withVerify: boolean): Buffer {
    // Check public key length
    if (pk.length != PK_LENGTH) {
      throw new Error("Invalid key length");
    }
    return script.compile([
      pk,
      withVerify ? opcodes.OP_CHECKSIGVERIFY : opcodes.OP_CHECKSIG
    ]);
  }

  /**
   * Builds a multi-key script in the form:
   *    <pk1> OP_CHEKCSIG <pk2> OP_CHECKSIGADD <pk3> OP_CHECKSIGADD ... <pkN> OP_CHECKSIGADD <threshold> OP_NUMEQUAL
   *    <withVerify -> OP_NUMEQUALVERIFY>
   * It validates whether provided keys are unique and the threshold is not greater than number of keys
   * If there is only one key provided it will return single key sig script
   * @param {Array<string>} pks - An array of public keys.
   * @param {number} threshold - The required number of valid signers.
   * @param {boolean} withVerify - A boolean indicating whether to include the OP_VERIFY opcode.
   * @return {Buffer} The compiled multi-key script as a Buffer.
   * @throws {Error} If no keys are provided, if the required number of valid signers is greater than the number of provided keys, or if duplicate keys are provided.
   */
  #buildMultiKeyScript(
    pks: Buffer[],
    threshold: number,
    withVerify: boolean
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
        "Required number of valid signers is greater than number of provided keys"
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
