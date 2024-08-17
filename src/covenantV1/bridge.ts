import {
  payments,
  Psbt,
  Transaction,
  networks
} from "bitcoinjs-lib";

import { initBTCCurve } from "../utils/curve";
import { buildDepositScript } from "./bridge.script";
import { UTXO } from "../types/UTXO";
import { inputValueSum, getTxInputUTXOsAndFees } from "../utils/fee";
import { hasOpReturnOutput, minBtc } from "../utils/scriptUtils";

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

  if (feeRate < minBtc) {
    throw new Error(`fee rate cannot be less than or equal to ${minBtc}`);
  }


  const psbt = new Psbt({ network });

  const p2wsh = payments.p2wsh({
    redeem: { output: scripts.depositScript, network },
    network
  });

  const { selectedUTXOs, fee } = getTxInputUTXOsAndFees(inputUTXOs, amount, feeRate, 2);

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

  if (minimumFee < minBtc) {
    throw new Error(`Minimum fee cannot be less than or equal to ${minBtc}`);
  }

  // Ensure that the minimum fee does not exceed the output value
  const outputValue = depositTransaction.outs[outputIndex].value;
  if (minimumFee >= outputValue) {
    throw new Error("Minimum fee must be less than the output value");
  }

  if (hasOpReturnOutput(depositTransaction.outs[outputIndex])) {
    throw new Error("OP RETURN cannot exist in the output");
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

  const value = outputValue - minimumFee;

  if (value < minBtc) {
    throw new Error(`The output value cannot be less than ${minBtc}`);
  }

  psbt.addOutput({
    address: sendAddress,
    value // Subtract the minimum fee from the output value
  });

  return { psbt };
}

