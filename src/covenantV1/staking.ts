import {
  payments,
  Psbt,
  Transaction,
  networks, address, script,
} from "bitcoinjs-lib";

import { initBTCCurve } from "./utils/curve";
import { buildDepositScript } from "./utils/bridge.script";
import { UTXO } from "./types/UTXO";
import { inputValueSum, getDepositTxInputUTXOsAndFees } from "./utils/fee";
import { PsbtTransactionResult } from "../staking/types/transaction";

export { initBTCCurve, buildDepositScript };

// https://bips.xyz/370
const BTC_LOCKTIME_HEIGHT_TIME_CUTOFF = 500000000;
const BTC_DUST_SAT = 546;

export function stakingTransaction(
  scripts: {
    stakingScript: Buffer,
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
    redeem: { output: scripts.stakingScript, network },
    network
  });

  const { selectedUTXOs, fee } = getDepositTxInputUTXOsAndFees(inputUTXOs, amount, feeRate, 2);

  selectedUTXOs.forEach((input) => {
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, "hex"),
        value: input.value
      },
      redeemScript: scripts.stakingScript,
      sequence: 0xfffffffd // Enable locktime by setting the sequence value to (RBF-able)
    });
  });

  // Add the staking output to the transaction
  psbt.addOutput({
    address: p2wsh.address!,
    value: amount
  });

  const inputsSum = inputValueSum(selectedUTXOs);

  if ((inputsSum - (amount + fee)) > BTC_DUST_SAT) {
    psbt.addOutput({
      address: changeAddress,
      value: inputsSum - (amount + fee)
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

  return {
    psbt,
    fee
  };
}

export function withdrawalTimeLockTransaction(
  scripts: {
    stakingScript: Buffer,
  },
  stakingTransaction: Transaction,
  withdrawalAddress: string,
  minimumFee: number,
  network: networks.Network,
  outputIndex = 0,
) {
  if (minimumFee <= 0) {
    throw new Error("Minimum fee must be bigger than 0");
  }

  const decompiled = script.decompile(scripts.stakingScript);

  if (!decompiled) {
    throw new Error("Timelock script is not valid");
  }

  // position of time in the timelock script
  const timePosition = 4;
  let timelock = 0;

  if (Buffer.isBuffer(decompiled[timePosition])) {
    const timeBuffer = decompiled[timePosition] as Buffer;
    timelock = script.number.decode(timeBuffer);
  } else {
    // in case timelock is <= 16 it will be a number, not a buffer
    const wrap = decompiled[timePosition] as number % 16;
    timelock = wrap === 0 ? 16 : wrap;
  }

  console.log("Timelock:", timelock);

  const psbt = new Psbt({ network });

  psbt.addInput({
    hash: stakingTransaction.getHash(),
    index: outputIndex,
    witnessUtxo: {
      value: stakingTransaction.outs[outputIndex].value,
      script: stakingTransaction.outs[outputIndex].script
    },
    witnessScript: scripts.stakingScript, // Adding witnessScript here
    sequence: timelock
  });

  psbt.addOutput({
    address: withdrawalAddress,
    value: stakingTransaction.outs[outputIndex].value - minimumFee
  });

  return { psbt };
}

export function withdrawalUnbondingTransaction(
  scripts: {
    stakingScript: Buffer,
  },
  stakingTransaction: Transaction,
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
    hash: stakingTransaction.getHash(),
    index: outputIndex,
    witnessUtxo: {
      value: stakingTransaction.outs[outputIndex].value,
      script: stakingTransaction.outs[outputIndex].script
    },
    witnessScript: scripts.stakingScript, // Adding witnessScript here
  });

  psbt.addOutput({
    address: withdrawalAddress,
    value: stakingTransaction.outs[outputIndex].value - transactionFee
  });

  return { psbt };
}
