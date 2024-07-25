import {
  payments,
  Psbt,
  Transaction,
  networks
} from "bitcoinjs-lib";

import { initBTCCurve } from "./utils/curve";
import { buildDepositScript } from "./utils/bridge.script";
import { UTXO } from "./types/UTXO";
import { inputValueSum, getDepositTxInputUTXOsAndFees } from "./utils/fee";

export { initBTCCurve, buildDepositScript };

// https://bips.xyz/370
const BTC_DUST_SAT = 546;

export function depositTransaction(
  scripts: {
    depositScript: Buffer,
  },
  amount: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  feeRate: number
  ) {
  if (amount <= 0 || feeRate <= 0) {
    throw new Error("Amount and fee rate must be bigger than 0");
  }

  const psbt = new Psbt({ network });

  const p2wsh = payments.p2wsh({
    redeem: { output: scripts.depositScript, network },
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
      redeemScript: scripts.depositScript,
      sequence: 0xfffffffd // Enable locktime by setting the sequence value to (RBF-able)
    });
  });

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

  return {
    psbt,
    fee
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
  outputIndex = 0
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
      script: depositTransaction.outs[outputIndex].script
    },
    witnessScript: scripts.depositScript // This is typically the same as the script used for depositing if P2WSH was used
  });

  psbt.addOutput({
    address: sendAddress,
    value: outputValue - minimumFee // Subtract the minimum fee from the output value
  });

  return { psbt };
}

