import {
  script,
  payments,
  Psbt,
  Transaction,
  networks,
  address
} from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";

import { internalPubkey } from "../../constants/internalPubkey";
import { PK_LENGTH, LockingScriptData } from "./script";
import { PsbtTransactionResult } from "../../types/transaction";
import { UTXO } from "../../types/UTXO";
import { LockingScripts } from "../../types/LockingScripts";
import { getEstimatedFee, inputValueSum, getTxInputUTXOsAndFees } from "../../utils/fee";
import { BTC_DUST_SAT, BTC_LOCKTIME_HEIGHT_TIME_CUTOFF } from "../../constants";

export { LockingScriptData };
export { type UTXO, type LockingScripts };

/**
 * Constructs an unsigned BTC Locking transaction in psbt format.
 *
 * Outputs:
 * - psbt:
 *   - The first output corresponds to the locking script with the specified amount.
 *   - The second output corresponds to the change from spending the amount and the transaction fee.
 *   - If a provably note script is provided, it will be added as the second output, and the fee will be the third output.
 * - fee: The total fee amount for the transaction.
 *
 * Inputs:
 * - scripts:
 *   - timelockScript, unbondingScript, slashingScript: Scripts for different transaction types.
 *   - provablyNoteScript: Optional provably note script.
 * - amount: Amount to lock.
 * - changeAddress: Address to send the change to.
 * - inputUTXOs: All available UTXOs from the wallet.
 * - network: Bitcoin network.
 * - feeRate: Fee rate in satoshis per byte.
 * - publicKeyNoCoord: Public key if the wallet is in taproot mode.
 * - lockHeight: Optional block height locktime to set for the transaction (i.e., not mined until the block height).
 *
 * @param {Object} scripts - Scripts used to construct the taproot output.
 * such as timelockScript, unbondingScript, slashingScript, and provablyNoteScript.
 * @param {number} amount - The amount to lock.
 * @param {string} changeAddress - The address to send the change to.
 * @param {UTXO[]} inputUTXOs - All available UTXOs from the wallet.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} feeRate - The fee rate in satoshis per byte.
 * @param {Buffer} [publicKeyNoCoord] - The public key if the wallet is in taproot mode.
 * @param {number} [lockHeight] - The optional block height locktime.
 * @return {PsbtTransactionResult} The partially signed transaction and the fee.
 * @throws Will throw an error if the amount or fee rate is less than or equal
 * to 0, if the change address is invalid, or if the public key is invalid.
 */
export function lockingTransaction(
  scripts: {
    timelockScript: Buffer,
    unbondingScript: Buffer,
    slashingScript: Buffer,
    provablyNoteScript?: Buffer,
  },
  amount: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  feeRate: number,
  publicKeyNoCoord?: Buffer,
  lockHeight?: number
): PsbtTransactionResult {
  // Check that amount and fee rate are non-negative integers greater than 0
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(feeRate) || feeRate <= 0) {
    throw new Error("Amount and fee rate must be non-negative integers greater than 0");
  }

  // Check whether the change address is a valid Bitcoin address.
  if (!address.toOutputScript(changeAddress, network)) {
    throw new Error("Invalid change address");
  }

  // Check whether the public key is valid
  if (publicKeyNoCoord && publicKeyNoCoord.length !== PK_LENGTH) {
    throw new Error("Invalid public key");
  }

  // Calculate the number of outputs based on the presence of the provably note script
  // We have 2 outputs by default: locking output and change output
  const numOutputs = scripts.provablyNoteScript ? 3 : 2;
  const { selectedUTXOs, fee } = getTxInputUTXOsAndFees(
    inputUTXOs, amount, feeRate, numOutputs
  );

  // Create a partially signed transaction
  const psbt = new Psbt({ network });
  // Add the UTXOs provided as inputs to the transaction
  for (let i = 0; i < selectedUTXOs.length; ++i) {
    const input = selectedUTXOs[i];
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, "hex"),
        value: input.value
      },
      // this is needed only if the wallet is in taproot mode
      ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
      sequence: 0xfffffffd // Enable locktime by setting the sequence value to (RBF-able)
    });
  }

  const scriptTree: Taptree = [
    {
      output: scripts.slashingScript
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }]
  ];

  // Create an pay-2-taproot (p2tr) output using the locking script
  const lockingOutput = payments.p2tr({
    internalPubkey,
    scriptTree,
    network
  });

  // Add the locking output to the transaction
  psbt.addOutput({
    address: lockingOutput.address!,
    value: amount
  });

  if (scripts.provablyNoteScript) {
    // Add the provably note output to the transaction
    psbt.addOutput({
      script: scripts.provablyNoteScript,
      value: 0
    });
  }

  // Set the locktime field if provided. If not provided, the locktime will be set to 0 by default
  // Only height based locktime is supported
  if (lockHeight) {
    if (lockHeight >= BTC_LOCKTIME_HEIGHT_TIME_CUTOFF) {
      throw new Error("Invalid lock height");
    }
    psbt.setLocktime(lockHeight);
  }

  // Calculate the change
  const inputsSum = inputValueSum(selectedUTXOs);
  const change = inputsSum - (amount + fee);

  // Dynamically decide whether to add a change output
  if (change > BTC_DUST_SAT) {
    psbt.addOutput({
      address: changeAddress,
      value: change
    });
  } else {
    // Recalculate fee assuming no change output
    const newFee = fee + change; // Increase the fee by the amount of dust
    return {
      psbt,
      fee: newFee
    };
  }

  return {
    psbt,
    fee
  };
}

/**
 * Constructs a withdrawal transaction for manually unbonded delegation.
 *
 * This transaction spends the unbonded output from the locking transaction.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 *   - slashingScript: Script for the slashing condition.
 * - tx: The original locking transaction.
 * - withdrawalAddress: The address to send the withdrawn funds to.
 * - network: The Bitcoin network.
 * - feeRate: The fee rate for the transaction in satoshis per byte.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * Returns:
 * - psbt: The partially signed transaction (PSBT).
 *
 * @param {Object} scripts - The scripts used in the transaction.
 * @param {Transaction} tx - The original locking transaction.
 * @param {string} withdrawalAddress - The address to send the withdrawn funds to.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @return {PsbtTransactionResult} An object containing the partially signed transaction (PSBT).
 */
export function withdrawEarlyUnbondedTransaction(
  scripts: {
    unbondingTimelockScript: Buffer,
    slashingScript: Buffer,
  },
  tx: Transaction,
  withdrawalAddress: string,
  network: networks.Network,
  feeRate: number,
  outputIndex: number = 0
): PsbtTransactionResult {
  const scriptTree: Taptree = [
    {
      output: scripts.slashingScript
    },
    { output: scripts.unbondingTimelockScript }
  ];

  return withdrawalTransaction(
    {
      timelockScript: scripts.unbondingTimelockScript
    },
    scriptTree,
    tx,
    withdrawalAddress,
    network,
    feeRate,
    outputIndex
  );
}

/**
 * Constructs a withdrawal transaction for naturally unbonded delegation.
 *
 * This transaction spends the unbonded output from the locking transaction when the timelock has expired.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - timelockScript: Script for the timelock condition.
 *   - slashingScript: Script for the slashing condition.
 *   - unbondingScript: Script for the unbonding condition.
 * - tx: The original locking transaction.
 * - withdrawalAddress: The address to send the withdrawn funds to.
 * - network: The Bitcoin network.
 * - feeRate: The fee rate for the transaction in satoshis per byte.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * Returns:
 * - psbt: The partially signed transaction (PSBT).
 *
 * @param {Object} scripts - The scripts used in the transaction.
 * @param {Transaction} tx - The original locking transaction.
 * @param {string} withdrawalAddress - The address to send the withdrawn funds to.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @return {PsbtTransactionResult} An object containing the partially signed transaction (PSBT).
 */
export function withdrawTimelockUnbondedTransaction(
  scripts: {
    timelockScript: Buffer,
    slashingScript: Buffer,
    unbondingScript: Buffer,
  },
  tx: Transaction,
  withdrawalAddress: string,
  network: networks.Network,
  feeRate: number,
  outputIndex: number = 0
): PsbtTransactionResult {
  const scriptTree: Taptree = [
    {
      output: scripts.slashingScript
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }]
  ];

  return withdrawalTransaction(
    scripts,
    scriptTree,
    tx,
    withdrawalAddress,
    network,
    feeRate,
    outputIndex
  );
}

// withdrawalTransaction generates a transaction that
// spends the locking output of the locking transaction
function withdrawalTransaction(
  scripts: {
    timelockScript: Buffer,
  },
  scriptTree: Taptree,
  tx: Transaction,
  withdrawalAddress: string,
  network: networks.Network,
  feeRate: number,
  outputIndex: number = 0
): PsbtTransactionResult {
  // Check that withdrawal feeRate is bigger than 0
  if (feeRate <= 0) {
    throw new Error("Withdrawal feeRate must be bigger than 0");
  }

  if (outputIndex < 0 || outputIndex >= tx.outs.length) {
    throw new Error("Output index is out of bounds");
  }

  // position of time in the timelock script
  const timePosition = 2;
  const decompiled = script.decompile(scripts.timelockScript);

  if (!decompiled) {
    throw new Error("Timelock script is not valid");
  }

  let timelock = 0;

  // if the timelock is a buffer, it means it's a number bigger than 16 blocks
  if (typeof decompiled[timePosition] !== "number") {
    const timeBuffer = decompiled[timePosition] as Buffer;
    timelock = script.number.decode(timeBuffer);
  } else {
    // in case timelock is <= 16 it will be a number, not a buffer
    const wrap = decompiled[timePosition] as number % 16;
    timelock = wrap === 0 ? 16 : wrap;
  }

  const redeem = {
    output: scripts.timelockScript,
    redeemVersion: 192
  };

  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree,
    redeem,
    network
  });

  const tapLeafScript = {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1]
  };

  const psbt = new Psbt({ network });

  // only transactions with version 2 can trigger OP_CHECKSEQUENCEVERIFY
  // https://github.com/btcsuite/btcd/blob/master/txscript/opcode.go#L1174
  psbt.setVersion(2);

  psbt.addInput({
    hash: tx.getHash(),
    index: outputIndex,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: tx.outs[outputIndex].value,
      script: tx.outs[outputIndex].script
    },
    tapLeafScript: [tapLeafScript],
    sequence: timelock
  });

  // withdraw tx always has 1 output only
  const estimatedFee = getEstimatedFee(feeRate, psbt.txInputs.length, 1);

  const outputValue = tx.outs[outputIndex].value - estimatedFee;

  if (outputValue < 0) {
    throw new Error("Output value is smaller than minimum fee");
  }

  if (outputValue < BTC_DUST_SAT) {
    throw new Error("Output value is smaller than dust");
  }

  psbt.addOutput({
    address: withdrawalAddress,
    value: outputValue
  });

  return {
    psbt,
    fee: estimatedFee
  };
}

/**
 * Constructs a slashing transaction for a locking output without prior unbonding.
 *
 * This transaction spends the locking output of the locking transaction and distributes the funds
 * according to the specified slashing rate.
 *
 * Outputs:
 * - The first output sends `input * slashing_rate` funds to the slashing address.
 * - The second output sends `input * (1 - slashing_rate) - fee` funds back to the user's address.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - slashingScript: Script for the slashing condition.
 *   - timelockScript: Script for the timelock condition.
 *   - unbondingScript: Script for the unbonding condition.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 * - transaction: The original locking transaction.
 * - slashingAddress: The address to send the slashed funds to.
 * - slashingRate: The rate at which the funds are slashed (0 < slashingRate < 1).
 * - minimumFee: The minimum fee for the transaction in satoshis.
 * - network: The Bitcoin network.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * @param {Object} scripts - The scripts used in the transaction.
 * @param {Transaction} lockingTransaction - The original locking transaction. * @param {string} slashingAddress - The address to send the slashed funds to.
 * @param {string} slashingAddress: The address to send the slashed funds to.
 * @param {number} slashingRate - The rate at which the funds are slashed.
 * @param {number} minimumFee - The minimum fee for the transaction in satoshis.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @return {{ psbt: Psbt }} An object containing the partially signed transaction (PSBT).
 */
export function slashTimelockUnbondedTransaction(
  scripts: {
    slashingScript: Buffer,
    timelockScript: Buffer,
    unbondingScript: Buffer,
    unbondingTimelockScript: Buffer,
  },
  lockingTransaction: Transaction,
  slashingAddress: string,
  slashingRate: number,
  minimumFee: number,
  network: networks.Network,
  outputIndex: number = 0
): { psbt: Psbt } {
  const slashingScriptTree: Taptree = [
    {
      output: scripts.slashingScript
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }]
  ];
  return slashingTransaction(
    {
      unbondingTimelockScript: scripts.unbondingTimelockScript,
      slashingScript: scripts.slashingScript
    },
    slashingScriptTree,
    lockingTransaction,
    slashingAddress,
    slashingRate,
    minimumFee,
    network,
    outputIndex
  );
}

/**
 * Constructs a slashing transaction for an early unbonded transaction.
 *
 * This transaction spends the locking output of the locking transaction and distributes the funds
 * according to the specified slashing rate.
 *
 * Outputs:
 * - The first output sends `input * slashing_rate` funds to the slashing address.
 * - The second output sends `input * (1 - slashing_rate) - fee` funds back to the user's address.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - slashingScript: Script for the slashing condition.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 * - transaction: The original locking transaction.
 * - slashingAddress: The address to send the slashed funds to.
 * - slashingRate: The rate at which the funds are slashed (0 < slashingRate < 1).
 * - minimumFee: The minimum fee for the transaction in satoshis.
 * - network: The Bitcoin network.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * Returns:
 * - psbt: The partially signed transaction (PSBT).
 *
 * @param {Object} scripts - The scripts used in the transaction. e.g slashingScript, unbondingTimelockScript
 * @param {Transaction} lockingTransaction - The original locking transaction. * @param {string} slashingAddress - The address to send the slashed funds to.
 * @param {number} slashingAddress - The address that will be slashed.
 * @param {number} slashingRate - The rate at which the funds are slashed.
 * @param {number} minimumFee - The minimum fee for the transaction in satoshis.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @return {{ psbt: Psbt }} An object containing the partially signed transaction (PSBT).
 */
export function slashEarlyUnbondedTransaction(
  scripts: {
    slashingScript: Buffer,
    unbondingTimelockScript: Buffer,
  },
  lockingTransaction: Transaction,
  slashingAddress: string,
  slashingRate: number,
  minimumFee: number,
  network: networks.Network,
  outputIndex: number = 0
): { psbt: Psbt } {
  const unbondingScriptTree: Taptree = [
    {
      output: scripts.slashingScript
    },
    {
      output: scripts.unbondingTimelockScript
    }
  ];
  return slashingTransaction(
    {
      unbondingTimelockScript: scripts.unbondingTimelockScript,
      slashingScript: scripts.slashingScript
    },
    unbondingScriptTree,
    lockingTransaction,
    slashingAddress,
    slashingRate,
    minimumFee,
    network,
    outputIndex
  );
}

/**
 * Constructs a slashing transaction for an on-demand unbonding.
 *
 * This transaction spends the locking output of the locking transaction and distributes the funds
 * according to the specified slashing rate.
 *
 * Outputs:
 * - The first output sends `input * slashing_rate` funds to the slashing address.
 * - The second output sends `input * (1 - slashing_rate) - fee` funds back to the user's address.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - slashingScript: Script for the slashing condition.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 * - transaction: The original locking transaction.
 * - slashingAddress: The address to send the slashed funds to.
 * - slashingRate: The rate at which the funds are slashed (0 < slashingRate < 1).
 * - minimumFee: The minimum fee for the transaction in satoshis.
 * - network: The Bitcoin network.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * @param {Object} scripts - The scripts used in the transaction. e.g slashingScript, unbondingTimelockScript
 * @param {Taptree} scriptTree - The taproot script tree.
 * @param {Transaction} transaction - The original locking transaction.
 * @param {string} slashingAddress - The address to send the slashed funds to.
 * @param {number} slashingRate - The rate at which the funds are slashed.
 * @param {number} minimumFee - The minimum fee for the transaction in satoshis.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @return {{ psbt: Psbt }} An object containing the partially signed transaction (PSBT).
 */
function slashingTransaction(
  scripts: {
    unbondingTimelockScript: Buffer,
    slashingScript: Buffer,
  },
  scriptTree: Taptree,
  transaction: Transaction,
  slashingAddress: string,
  slashingRate: number,
  minimumFee: number,
  network: networks.Network,
  outputIndex: number = 0
): {
  psbt: Psbt
} {
  // Check that slashing rate and minimum fee are bigger than 0
  if (slashingRate <= 0 || minimumFee <= 0) {
    throw new Error("Slashing rate and minimum fee must be bigger than 0");
  }

  if (outputIndex < 0 || outputIndex >= transaction.outs.length) {
    throw new Error("Output index is out of bounds");
  }

  const redeem = {
    output: scripts.slashingScript,
    redeemVersion: 192
  };

  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree,
    redeem,
    network
  });

  const tapLeafScript = {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1]
  };

  const psbt = new Psbt({ network });
  psbt.addInput({
    hash: transaction.getHash(),
    index: outputIndex,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: transaction.outs[0].value,
      script: transaction.outs[0].script
    },
    tapLeafScript: [tapLeafScript]
  });

  const userValue = transaction.outs[0].value * (1 - slashingRate) - minimumFee;

  // We need to verify that this is above 0
  if (userValue <= 0) {
    // If it is not, then an error is thrown and the user has to lock more
    throw new Error("Not enough funds to slash, lock more");
  }

  // Add the slashing output
  psbt.addOutput({
    address: slashingAddress,
    value: transaction.outs[0].value * slashingRate
  });

  // Change output contains unbonding timelock script
  const changeOutput = payments.p2tr({
    internalPubkey,
    scriptTree: { output: scripts.unbondingTimelockScript },
    network
  });

  // Add the change output
  psbt.addOutput({
    address: changeOutput.address!,
    value: transaction.outs[0].value * (1 - slashingRate) - minimumFee
  });

  return { psbt };
}

export function unbondingTransaction(
  scripts: {
    unbondingScript: Buffer,
    unbondingTimelockScript: Buffer,
    timelockScript: Buffer,
    slashingScript: Buffer,
  },
  lockingTx: Transaction,
  transactionFee: number,
  network: networks.Network,
  outputIndex: number = 0
): {
  psbt: Psbt
} {
  // Check that transaction fee is bigger than 0
  if (transactionFee <= 0) {
    throw new Error("Unbonding fee must be bigger than 0");
  }

  if (outputIndex < 0 || outputIndex >= lockingTx.outs.length) {
    throw new Error("Output index is out of bounds");
  }

  // Build input tapleaf script
  const inputScriptTree: Taptree = [
    {
      output: scripts.slashingScript
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }]
  ];

  const inputRedeem = {
    output: scripts.unbondingScript,
    redeemVersion: 192
  };

  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree: inputScriptTree,
    redeem: inputRedeem,
    network
  });

  const inputTapLeafScript = {
    leafVersion: inputRedeem.redeemVersion,
    script: inputRedeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1]
  };

  const psbt = new Psbt({ network });
  psbt.addInput({
    hash: lockingTx.getHash(),
    index: outputIndex,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: lockingTx.outs[0].value,
      script: lockingTx.outs[0].script
    },
    tapLeafScript: [inputTapLeafScript]
  });

  // Build output tapleaf script
  const outputScriptTree: Taptree = [
    {
      output: scripts.slashingScript
    },
    { output: scripts.unbondingTimelockScript }
  ];

  const unbondingOutput = payments.p2tr({
    internalPubkey,
    scriptTree: outputScriptTree,
    network
  });

  // Add the unbonding output
  psbt.addOutput({
    address: unbondingOutput.address!,
    value: lockingTx.outs[0].value - transactionFee
  });

  return {
    psbt
  };
}

// this function is used to create witness for unbonding transaction
export const createWitness = (
  originalWitness: Buffer[],
  paramsCovenants: Buffer[],
  covenantSigs: {
    btc_pk_hex: string;
    sig_hex: string;
  }[]
) => {
  // map API response to Buffer values
  const covenantSigsBuffers = covenantSigs.map((sig) => ({
    btc_pk_hex: Buffer.from(sig.btc_pk_hex, "hex"),
    sig_hex: Buffer.from(sig.sig_hex, "hex")
  }));
  // we need covenant from params to be sorted in reverse order
  const paramsCovenantsSorted = [...paramsCovenants]
    .sort(Buffer.compare)
    .reverse();
  const composedCovenantSigs = paramsCovenantsSorted.map((covenant) => {
    // in case there's covenant with this btc_pk_hex we return the sig
    // otherwise we return empty Buffer
    const covenantSig = covenantSigsBuffers.find(
      (sig) => sig.btc_pk_hex.compare(covenant) === 0
    );
    return covenantSig?.sig_hex || Buffer.alloc(0);
  });
  return [...composedCovenantSigs, ...originalWitness];
};

/**
 * Creates a PSBT transaction to continue timelock locking.
 *
 * @param {Object} scripts - Scripts for different stages of the transaction.
 * @param {Buffer} scripts.timelockScript - Script to lock the transaction by height.
 * @param {Buffer} scripts.slashingScript - Script for slashing.
 * @param {Buffer} scripts.unbondingScript - Script for unbonding.
 * @param {Buffer} [scripts.provablyNoteScript] - Optional script for provably note.
 * @param {Transaction} tx - The original transaction to continue locking.
 * @param {networks.Network} network - The Bitcoin network to use (mainnet, testnet, etc.).
 * @param {number} feeRate - Fee rate in satoshis per byte.
 * @param {number} [outputIndex=0] - Index of the output to be spent.
 * @param {number} [additionalAmount=0] - Additional amount to be added to the output.
 * @param {string} changeAddress - Address for the change output.
 * @param {UTXO[]} inputUTXOs - Array of UTXOs to be used as inputs.
 * @param {Buffer} [publicKeyNoCoord] - Optional public key without coordinates.
 * @param {number} [lockHeight] - Optional lock height for the transaction.
 * @return {PsbtTransactionResult} - The result containing the PSBT transaction and additional data.
 */
export function continueTimelockLockingTransaction(
  scripts: {
    timelockScript: Buffer, // may be a new timelockScript by lockHeight
    slashingScript: Buffer,
    unbondingScript: Buffer,
    provablyNoteScript?: Buffer,
  },
  tx: Transaction,
  network: networks.Network,
  feeRate: number,
  outputIndex: number = 0,
  additionalAmount: number = 0,
  changeAddress: string,
  inputUTXOs: UTXO[],
  publicKeyNoCoord?: Buffer,
  lockHeight?: number
): PsbtTransactionResult {
  // Create script tree for Taproot
  const scriptTree: Taptree = [
    {
      output: scripts.slashingScript
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }]
  ];

  // Basic validation checks
  if (feeRate <= 0) {
    throw new Error("Withdrawal feeRate must be bigger than 0");
  }

  if (outputIndex < 0 || outputIndex >= tx.outs.length) {
    throw new Error("Output index is out of bounds");
  }

  // position of time in the timelock script
  const timePosition = 2;
  // Decompile and validate timelock script
  const decompiled = script.decompile(scripts.timelockScript);
  if (!decompiled) {
    throw new Error("Timelock script is not valid");
  }

  // Extract timelock value from script
  let timelock = 0;
  if (typeof decompiled[timePosition] !== "number") {
    const timeBuffer = decompiled[timePosition] as Buffer;
    timelock = script.number.decode(timeBuffer);
  } else {
    const wrap = decompiled[timePosition] as number % 16;
    timelock = wrap === 0 ? 16 : wrap;
  }

  const redeem = {
    output: scripts.timelockScript,
    redeemVersion: 192
  };

  // Generate Taproot payment output
  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree,
    redeem,
    network
  });

  const tapLeafScript = {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1]
  };

  const psbt = new Psbt({ network });

  // Set PSBT version to 2
  psbt.setVersion(2);

  // Add input with timelock sequence
  psbt.addInput({
    hash: tx.getHash(),
    index: outputIndex,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: tx.outs[outputIndex].value,
      script: tx.outs[outputIndex].script
    },
    tapLeafScript: [tapLeafScript],
    sequence: timelock
  });

  // Validate output value
  const outputValue = tx.outs[outputIndex].value;
  if (outputValue < BTC_DUST_SAT) {
    throw new Error("Output value is less than dust limit");
  }

  // Calculate estimated fee and check amounts
  const estimatedFee = getEstimatedFee(feeRate, psbt.txInputs.length, 1);
  const amount = tx.outs[outputIndex].value - estimatedFee + additionalAmount;
  if (amount <= 0) {
    throw new Error("Amount and fee rate must be bigger than 0");
  }

  // Validate change address
  if (!address.toOutputScript(changeAddress, network)) {
    throw new Error("Invalid change address");
  }

  // Validate public key if provided
  const PK_LENGTH = 33; // Example constant for public key length
  if (publicKeyNoCoord && publicKeyNoCoord.length !== PK_LENGTH) {
    throw new Error("Invalid public key");
  }

  // Determine number of outputs
  const numOutputs = scripts.provablyNoteScript ? 3 : 2;
  const { selectedUTXOs, fee } = getTxInputUTXOsAndFees(inputUTXOs, additionalAmount, feeRate, numOutputs);

  // Add UTXOs as inputs
  for (const input of selectedUTXOs) {
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, "hex"),
        value: input.value
      },
      ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
      sequence: 0xfffffffd // RBF sequence
    });
  }

  // Add locking output
  psbt.addOutput({
    address: p2tr.address!,
    value: amount
  });

  // Add provably note output if present
  if (scripts.provablyNoteScript) {
    psbt.addOutput({
      script: scripts.provablyNoteScript,
      value: 0
    });
  }

  // Calculate change amount and add change output if necessary
  const inputsSum = inputValueSum(selectedUTXOs);
  const changeAmount = inputsSum - (amount + fee);
  if (changeAmount > BTC_DUST_SAT) {
    psbt.addOutput({
      address: changeAddress,
      value: changeAmount
    });
  }

  // Set locktime if provided
  if (lockHeight) {
    if (lockHeight >= BTC_LOCKTIME_HEIGHT_TIME_CUTOFF) {
      throw new Error("Invalid lock height");
    }
    psbt.setLocktime(lockHeight);
  }

  return {
    psbt,
    fee
  }
}

/**
 * Creates a PSBT transaction to continue unbonded locking.
 *
 * @param {Object} scripts - Scripts for different stages of the transaction.
 * @param {Buffer} scripts.timelockScript - Script to lock the transaction by height.
 * @param {Buffer} scripts.slashingScript - Script for slashing.
 * @param {Buffer} scripts.unbondingScript - Script for unbonding.
 * @param {Buffer} [scripts.provablyNoteScript] - Optional script for storing provably data.
 * @param {Transaction} lockingTx - The original transaction to continue locking.
 * @param {number} transactionFee - the fee for current transaction.
 * @param {networks.Network} network - The Bitcoin network to use (mainnet, testnet, etc.).
 * @param {number} [outputIndex=0] - Index of the output to be spent.
 * @param {number} [additionalAmount=0] - Additional amount to be added to the output.
 * @param {string} changeAddress - Address for the change output.
 * @param {UTXO[]} inputUTXOs - Array of UTXOs to be used as inputs.
 * @param {number} feeRate - Fee rate in satoshis per byte.
 * @param {Buffer} [publicKeyNoCoord] - Optional public key without coordinates.
 * @param {number} [lockHeight] - Optional lock height for the transaction.
 * @return {PsbtTransactionResult} - The result containing the PSBT transaction and additional data.
 */
export function continueUnbondingLockingTransaction(
  scripts: {
    unbondingScript: Buffer,
    unbondingTimelockScript: Buffer,
    timelockScript: Buffer,
    slashingScript: Buffer,
    provablyNoteScript: Buffer,
  },
  lockingTx: Transaction,
  transactionFee: number,
  network: networks.Network,
  outputIndex: number = 0,
  additionalAmount: number = 0,
  changeAddress: string,
  inputUTXOs: UTXO[],
  feeRate: number,
  publicKeyNoCoord?: Buffer,
  lockHeight?: number
): PsbtTransactionResult {
  // Check that transaction fee is bigger than 0
  if (transactionFee <= 0) {
    throw new Error("Unbonding fee must be bigger than 0");
  }

  if (outputIndex < 0 || outputIndex >= lockingTx.outs.length) {
    throw new Error("Output index is out of bounds");
  }

  // Build input tapleaf script
  const inputScriptTree: Taptree = [
    {
      output: scripts.slashingScript
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }]
  ];

  const inputRedeem = {
    output: scripts.unbondingScript,
    redeemVersion: 192
  };

  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree: inputScriptTree,
    redeem: inputRedeem,
    network
  });

  const inputTapLeafScript = {
    leafVersion: inputRedeem.redeemVersion,
    script: inputRedeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1]
  };

  const psbt = new Psbt({ network });
  const originLockingOutput = {
    hash: lockingTx.getHash(),
    index: outputIndex,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: lockingTx.outs[0].value,
      script: lockingTx.outs[0].script
    },
    tapLeafScript: [inputTapLeafScript]
  }
  psbt.addInput(originLockingOutput);

  // Build output tapleaf script
  const outputScriptTree: Taptree = [
    {
      output: scripts.slashingScript
    },
    [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }]
  ];

  const lockingOutput = payments.p2tr({
    internalPubkey,
    scriptTree: outputScriptTree,
    network
  });

  const amount = lockingTx.outs[0].value - transactionFee + additionalAmount;

    /*
  const numOutputs = scripts.provablyNoteScript ? 3 : 2;
  const { selectedUTXOs, fee } = getLockingTxInputUTXOsAndFees(
    inputUTXOs, additionalAmount, feeRate, numOutputs
  );

  // Add the UTXOs provided as inputs to the transaction
  for (let i = 0; i < selectedUTXOs.length; ++i) {
    const input = selectedUTXOs[i];
    console.log('selectedUTXOs: ', input)
    // psbt.addInput({
    //   hash: input.txid,
    //   index: input.vout,
    //   witnessUtxo: {
    //     script: Buffer.from(input.scriptPubKey, "hex"),
    //     value: input.value,
    //   },
    //   this is needed only if the wallet is in taproot mode
      // ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
      // sequence: 0xfffffffd, // Enable locktime by setting the sequence value to (RBF-able)
    // });
  }
  */

    // Add the unbonding output
  psbt.addOutput({
    address: lockingOutput.address!,
    value: amount // amount
  });

  if (scripts.provablyNoteScript) {
    // Add the data output to the transaction
    psbt.addOutput({
      script: scripts.provablyNoteScript,
      value: 0
    });
  }

  // Add a change output only if there's any amount leftover from the inputs
  // const inputsSum = inputValueSum(selectedUTXOs);
  // const inputsSum = lockingTx.outs[0].value;
  // Check if the change amount is above the dust limit, and if so, add it as a change output
  // console.log(`${inputsSum} ${additionalAmount} ${fee}`);
  // if ((inputsSum - (additionalAmount + fee)) > BTC_DUST_SAT) {
  //   psbt.addOutput({
  //     address: changeAddress,
  //     // value: inputsSum - (additionalAmount + fee),
  //     value: inputsSum - (additionalAmount),
  //   });
  // }

  if (lockHeight) {
    if (lockHeight >= BTC_LOCKTIME_HEIGHT_TIME_CUTOFF) {
      throw new Error("Invalid lock height");
    }
    psbt.setLocktime(lockHeight);
  }

  const fee = 0;
  return {
    psbt,
    fee
  };
}
