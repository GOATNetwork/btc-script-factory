import {
  script,
  payments,
  Psbt,
  Transaction,
  networks,
  address,
} from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";

import { initBTCCurve } from "./utils/curve";
import { PK_LENGTH, GoatScriptData } from "./utils/goatScript";
import { PsbtTransactionResult } from "./types/transaction";
import { UTXO } from "./types/UTXO";
import { getEstimatedFee, inputValueSum, getDepositTxInputUTXOsAndFees } from "./utils/fee";

export { initBTCCurve, GoatScriptData };

// https://bips.xyz/370
const BTC_LOCKTIME_HEIGHT_TIME_CUTOFF = 500000000;
const BTC_DUST_SAT = 546;

export function depositTransaction(
  scripts: {
    depositScript: Buffer,
  },
  amount: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  feeRate: number,
  publicKeyNoCoord?: Buffer,
  lockHeight?: number,
  ) {
  if (amount <= 0 || feeRate <= 0) {
    throw new Error("Amount and fee rate must be bigger than 0");
  }

  const psbt = new Psbt({ network });

  const p2wsh = payments.p2wsh({
    redeem: payments.p2ms({
      output: scripts.depositScript,
      network,
    }),
    network,
  });

  const { selectedUTXOs, fee } = getDepositTxInputUTXOsAndFees(inputUTXOs, amount, feeRate, 2);

  selectedUTXOs.forEach(input => {
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, 'hex'),
        value: input.value,
      },
      redeemScript: p2wsh.redeem!.output,
      sequence: 0xfffffffd, // Enable locktime by setting the sequence value to (RBF-able)
    });
  });

  psbt.addOutput({
    address: p2wsh.address!,
    value: amount,
  });

  const inputsSum = inputValueSum(selectedUTXOs);

  if ((inputsSum - (amount + fee)) > BTC_DUST_SAT) {
    psbt.addOutput({
      address: changeAddress,
      value: inputsSum - (amount + fee),
    });
  }

  if (lockHeight) {
    if (lockHeight >= BTC_LOCKTIME_HEIGHT_TIME_CUTOFF) {
      throw new Error("Invalid lock height");
    }
    psbt.setLocktime(lockHeight);
  }

  return {
    psbt,
    fee,
  }
}

export function sendTransaction(
  scripts: {
    depositScript: Buffer,
  },
  depositTransaction: Transaction,
  sendAddress: string,
  minimumFee: number,
  network: networks.Network,
  outputIndex = 0,
) {
  if (minimumFee <= 0) {
    throw new Error("Minimum fee must be bigger than 0");
  }

  // Ensure that the minimum fee does not exceed the output value
  const outputValue = depositTransaction.outs[outputIndex].value;
  if (minimumFee >= outputValue) {
    throw new Error("Minimum fee must be less than the output value");
  }

  const psbt = new Psbt({ network });
  psbt.addInput({
    hash: depositTransaction.getHash(),
    index: outputIndex,
    witnessUtxo: {
      value: depositTransaction.outs[outputIndex].value,
      script: depositTransaction.outs[outputIndex].script,
    },
    witnessScript: scripts.depositScript, // This is typically the same as the script used for depositing if P2WSH was used
  });

  psbt.addOutput({
    address: sendAddress,
    value: outputValue - minimumFee, // Subtract the minimum fee from the output value
  });

  return { psbt };
}

