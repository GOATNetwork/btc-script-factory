import {
  payments,
  Psbt,
  Transaction,
  initEccLib,
  networks, address, script
} from "bitcoinjs-lib";

import { buildLockingScript } from "./locking.script";
import { UTXO } from "../types/UTXO";
import { inputValueSum } from "../utils/fee";
import { PsbtTransactionResult } from "../types/transaction";
import { BTC_DUST_SAT, BTC_LOCKTIME_HEIGHT_TIME_CUTOFF } from "../constants";
import { getSpendTxInputUTXOsAndFees, getWithdrawTxFee } from "../utils/feeV1";

export { buildLockingScript };

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
initEccLib(ecc);

export function lockingTransaction(
  scripts: {
    lockingScript: Buffer,
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

  const psbt = new Psbt({ network });

  const p2wsh = payments.p2wsh({
    redeem: { output: scripts.lockingScript, network },
    network
  });

  const psbtOutputs = [
    {
      address: p2wsh.address!,
      value: amount
    }
  ];
  const { selectedUTXOs, fee } = getSpendTxInputUTXOsAndFees(network, inputUTXOs, amount, feeRate, psbtOutputs);

  selectedUTXOs.forEach((input) => {
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
  });

  // Add the locking output to the transaction
  psbt.addOutputs(psbtOutputs);

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
  feeRate: number,
  network: networks.Network,
  outputIndex = 0
) {
  if (feeRate <= 0) {
    throw new Error("fee rate must be bigger than 0");
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

  const estimatedFee = getWithdrawTxFee(feeRate, lockingTransaction.outs[outputIndex].script);
  const outputValue = lockingTransaction.outs[outputIndex].value - estimatedFee

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
  feeRate: number,
  network: networks.Network,
  outputIndex: number = 0
) {
  if (feeRate <= 0) {
    throw new Error("fee rate must be bigger than 0");
  }

  if (outputIndex < 0 || outputIndex >= lockingTransaction.outs.length) {
    throw new Error("Output index is out of bounds");
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

  const estimatedFee = getWithdrawTxFee(feeRate, lockingTransaction.outs[outputIndex].script);
  const outputValue = lockingTransaction.outs[outputIndex].value - estimatedFee;

  if (outputValue < BTC_DUST_SAT) {
    throw new Error("Output value is smaller than dust");
  }

  psbt.addOutput({
    address: withdrawalAddress,
    value: outputValue
  });

  return { psbt };
}
