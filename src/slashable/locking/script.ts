import { script, opcodes } from "bitcoinjs-lib";

import { LockingScripts } from "../../types/LockingScripts";

// PK_LENGTH denotes the length of a public key in bytes
export const PK_LENGTH = 32;

// LockingScriptData is a class that holds the data required for the BTC Locking Script
// and exposes methods for converting it into useful formats
export class LockingScriptData {
  #lockerKey: Buffer;
  #operatorKeys: Buffer[];
  #covenantKeys: Buffer[];
  #covenantThreshold: number;
  #lockingTimeLock: number;
  #unbondingTimeLock: number;
  #magicBytes: Buffer;

  constructor(
    // The `lockerKey` is the public key of the locker without the coordinate bytes.
    lockerKey: Buffer,
    // A list of the public keys indicating the sequencer nodes
    operatorKeys: Buffer[],
    // A list of the public keys indicating the committee members.
    // This is a parameter of the goat system and should be retrieved from there.
    covenantKeys: Buffer[],
    // The number of covenant signatures required for a transaction
    // to be valid.
    // This is a parameter of the goat system and should be retrieved from there.
    covenantThreshold: number,
    // The locking period denoted as a number of BTC blocks.
    lockingTimelock: number,
    // The unbonding period denoted as a number of BTC blocks.
    // This value should be more than equal than the minimum unbonding time of the
    // goat system.
    unbondingTimelock: number,
    // The magic bytes used to identify the locking transaction on goat
    // through the data return script
    magicBytes: Buffer
  ) {
    // Check that required input values are not missing when creating an instance of the LockingScriptData class
    if (
      !lockerKey ||
      !operatorKeys ||
      !covenantKeys ||
      !covenantThreshold ||
      !lockingTimelock ||
      !unbondingTimelock ||
      !magicBytes
    ) {
      throw new Error("Missing required input values");
    }
    this.#lockerKey = lockerKey;
    this.#operatorKeys = operatorKeys;
    this.#covenantKeys = covenantKeys;
    this.#covenantThreshold = covenantThreshold;
    this.#lockingTimeLock = lockingTimelock;
    this.#unbondingTimeLock = unbondingTimelock;
    this.#magicBytes = magicBytes;

    // Run the validate method to check if the provided script data is valid
    if (!this.validate()) {
      throw new Error("Invalid script data provided");
    }
  }

  /**
   * Validates the locking script.
   * @return {boolean} Returns true if the locking script is valid, otherwise false.
   */
  validate(): boolean {
    // check that locker key is the correct length
    if (this.#lockerKey.length != PK_LENGTH) {
      return false;
    }
    // check that operator keys are the correct length
    if (
      this.#operatorKeys.some((operatorKey) => operatorKey.length != PK_LENGTH)
    ) {
      return false;
    }
    // check that covenant keys are the correct length
    if (
      this.#covenantKeys.some((covenantKey) => covenantKey.length != PK_LENGTH)
    ) {
      return false;
    }

      // Check whether we have any duplicate keys
    const allPks = [
      this.#lockerKey,
      ...this.#operatorKeys,
      ...this.#covenantKeys
    ];
    const allPksSet = new Set(allPks);
    if (allPks.length !== allPksSet.size) {
      return false;
    }

    // check that the threshold is above 0 and less than or equal to
    // the size of the covenant set
    if (
      this.#covenantThreshold == 0 ||
      this.#covenantThreshold > this.#covenantKeys.length
    ) {
      return false;
    }

    // check that maximum value for staking time is not greater than uint16 and above 0
    if (this.#lockingTimeLock == 0 || this.#lockingTimeLock > 65535) {
      return false;
    }

    // check that maximum value for unbonding time is not greater than uint16 and above 0
    if (this.#unbondingTimeLock == 0 || this.#unbondingTimeLock > 65535) {
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
      this.#lockerKey,
      opcodes.OP_CHECKSIGVERIFY,
      script.number.encode(timelock),
      opcodes.OP_CHECKSEQUENCEVERIFY
    ]);
  }

  /**
   * Builds the locking timelock script.
   * Only holder of private key for given pubKey can spend after relative lock time
   * Creates the timelock script in the form:
   *    <lockerPubKey>
   *    OP_CHECKSIGVERIFY
   *    <lockingTimeBlocks>
   *    OP_CHECKSEQUENCEVERIFY
   * @return {Buffer} The locking timelock script.
   */
  buildLockingTimelockScript(): Buffer {
    return this.buildTimelockScript(this.#lockingTimeLock);
  }

  /**
   * Builds the unbonding timelock script.
   * Creates the unbonding timelock script in the form:
   *    <lockerPubKey>
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
   *    buildSingleKeyScript(lockerPk, true) ||
   *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
   *    || means combining the scripts
   * @return {Buffer} The unbonding script.
   */
  buildUnbondingScript(): Buffer {
    return Buffer.concat([
      this.#buildSingleKeyScript(this.#lockerKey, true),
      this.#buildMultiKeyScript(
        this.#covenantKeys,
        this.#covenantThreshold,
        false
      )
    ]);
  }

  /**
   * Builds the slashing script for locking in the form:
   *    buildSingleKeyScript(lockerPk, true) ||
   *    buildMultiKeyScript(covenantPks, covenantThreshold, false)
   *    || means combining the scripts
   * The slashing script is a combination of single-key and multi-key scripts.
   * The single-key script is used for locker key verification.
   * The multi-key script is used for covenant key verification.
   * @return {Buffer} The slashing script as a Buffer.
   */
  buildSlashingScript(): Buffer {
    return Buffer.concat([
      this.#buildSingleKeyScript(this.#lockerKey, true),
      this.#buildMultiKeyScript(this.#operatorKeys, 1, true),
      this.#buildMultiKeyScript(
        this.#covenantKeys,
        this.#covenantThreshold,
        // No need to add verify since covenants are at the end of the script
        false
      )
    ]);
  }

  /**
   * Builds a data script for locking in the form:
   *    OP_RETURN || <serializedLockingData>
   * where serializedLockingData is the concatenation of:
   *    MagicBytes || Version || lockerPublicKey || LockingTimeLock
   * @return {Buffer} The compiled provably note script.
   */
  buildProvablyNoteScript(): Buffer {
    // 1 byte for version
    const version = Buffer.alloc(1);
    version.writeUInt8(0);
    // 2 bytes for locking time
    const lockingTimeLock = Buffer.alloc(2);
    // big endian
    lockingTimeLock.writeUInt16BE(this.#lockingTimeLock);
    const serializedLockingData = Buffer.concat([
      this.#magicBytes,
      version,
      this.#lockerKey,
      this.#operatorKeys[0],
      lockingTimeLock
    ]);
    return script.compile([opcodes.OP_RETURN, serializedLockingData]);
  }

  /**
   * Builds the locking scripts.
   * @return {LockingScripts} The locking scripts.
   */
  buildScripts(): LockingScripts {
    return {
      timelockScript: this.buildLockingTimelockScript(),
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
