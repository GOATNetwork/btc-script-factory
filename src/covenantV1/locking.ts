import {
  payments,
  Psbt,
  Transaction,
  networks, address, script
} from "bitcoinjs-lib";

import { buildLockingScript } from "./locking.script";
import { UTXO } from "../types/UTXO";
import { inputValueSum, getTxInputUTXOsAndFees } from "../utils/fee";
import { PsbtTransactionResult } from "../types/transaction";
import { BTC_DUST_SAT, BTC_LOCKTIME_HEIGHT_TIME_CUTOFF } from "../constants";

export { buildLockingScript };

export function lockingTransaction(
  scripts: {
    lockingScript: Buffer,
  },
  amount: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  feeRate: number,
  lockHeight?: number
): PsbtTransactionResult {
  // Check that amount and fee are bigger than 0
  if (amount <= 0 || feeRate <= 0) {
    throw new Error("Amount and fee rate must be bigger than 0");
  }

  // Check whether the change address is a valid Bitcoin address.
  if (!address.toOutputScript(changeAddress, network)) {
    throw new Error("Invalid change address");
  }

  const psbt = new Psbt({ network });

  const p2wsh = payments.p2wsh({
    redeem: { output: scripts.lockingScript, network },
    network
  });

  // Estimate fees with an assumed output count (initially 2 for recipient + change)
  let estimatedOutputs = 2;
  const { selectedUTXOs, fee } = getTxInputUTXOsAndFees(inputUTXOs, amount, feeRate, estimatedOutputs);

  selectedUTXOs.forEach((input) => {
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, "hex"),
        value: input.value
      },
      sequence: 0xfffffffd // Enable locktime by setting the sequence value to (RBF-able)
    });
  });

  // Add the locking output to the transaction
  psbt.addOutput({
    address: p2wsh.address!,
    value: amount
  });

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

export function withdrawalTimeLockTransaction(
  scripts: {
    lockingScript: Buffer,
  },
  lockingTransaction: Transaction,
  withdrawalAddress: string,
  minimumFee: number,
  network: networks.Network,
  outputIndex = 0
) {
  if (minimumFee <= 0) {
    throw new Error("Minimum fee must be bigger than 0");
  }

  const decompiled = script.decompile(scripts.lockingScript);

  if (!decompiled) {
    throw new Error("Timelock script is not valid");
  }

  // position of time in the timelock script
  const timePosition = 5;
  let timelock = 0;

  if (Buffer.isBuffer(decompiled[timePosition])) {
    const timeBuffer = decompiled[timePosition] as Buffer;
    timelock = script.number.decode(timeBuffer);
  } else {
    // in case timelock is <= 16 it will be a number, not a buffer
    const wrap = decompiled[timePosition] as number % 16;
    timelock = wrap === 0 ? 16 : wrap;
  }

  if (Number.isNaN(timelock) || timelock < 0 || timelock > 65535) {
    throw new Error("Timelock script is not valid");
  }

  const psbt = new Psbt({ network });

  psbt.addInput({
    hash: lockingTransaction.getId(),
    index: outputIndex,
    witnessUtxo: {
      value: lockingTransaction.outs[outputIndex].value,
      script: lockingTransaction.outs[outputIndex].script
    },
    witnessScript: scripts.lockingScript, // Adding witnessScript here
    sequence: timelock
  });

  const outputValue = lockingTransaction.outs[outputIndex].value - minimumFee

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

  return { psbt };
}

export function withdrawalUnbondingTransaction(
  scripts: {
    lockingScript: Buffer,
  },
  lockingTransaction: Transaction,
  withdrawalAddress: string,
  transactionFee: number,
  network: networks.Network,
  outputIndex: number = 0
) {
  // Check that transaction fee is bigger than 0
  if (transactionFee <= 0) {
    throw new Error("Unbonding fee must be bigger than 0");
  }

  // Check that outputIndex is bigger or equal to 0
  if (outputIndex < 0) {
    throw new Error("Output index must be bigger or equal to 0");
  }

  const psbt = new Psbt({ network });

  psbt.addInput({
    hash: lockingTransaction.getId(),
    index: outputIndex,
    witnessUtxo: {
      value: lockingTransaction.outs[outputIndex].value,
      script: lockingTransaction.outs[outputIndex].script
    },
    witnessScript: scripts.lockingScript // Adding witnessScript here
  });

  const outputValue = lockingTransaction.outs[outputIndex].value - transactionFee;

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

  return { psbt };
}
