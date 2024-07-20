import {
  script,
  payments,
  Psbt,
  Transaction,
  networks,
  address,
} from "bitcoinjs-lib";
import { Taptree } from "bitcoinjs-lib/src/types";

import { internalPubkey } from "./constants/internalPubkey";
import { initBTCCurve } from "./utils/curve";
import { PK_LENGTH, BridgeScriptData } from "./utils/bridgeScript";
import { PsbtTransactionResult } from "./types/transaction";
import { UTXO } from "./types/UTXO";
import { getEstimatedFee, inputValueSum, getDepositTxInputUTXOsAndFees } from "./utils/fee";

export { initBTCCurve, BridgeScriptData };

// https://bips.xyz/370
const BTC_LOCKTIME_HEIGHT_TIME_CUTOFF = 500000000;
const BTC_DUST_SAT = 546;

export function depositTransaction(
  scripts: {
    timelockScript: Buffer,
    transferScript: Buffer,
    dataEmbedScript?: Buffer,
  },
  amount: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  feeRate: number,
  publicKeyNoCoord?: Buffer,
  lockHeight?: number,
): PsbtTransactionResult {
  // Check that amount and fee are bigger than 0
  if (amount <= 0 || feeRate <= 0) {
    throw new Error("Amount and fee rate must be bigger than 0");
  }

  // Check whether the change address is a valid Bitcoin address.
  if (!address.toOutputScript(changeAddress, network)) {
    throw new Error("Invalid change address");
  }

  // Check whether the public key is valid
  if (publicKeyNoCoord && publicKeyNoCoord.length !== PK_LENGTH) {
    throw new Error("Invalid public key");
  }

  // Calculate the number of outputs based on the presence of the data embed script
  // We have 2 outputs by default: deposit output and change output
  const numOutputs = scripts.dataEmbedScript ? 3 : 2;
  const { selectedUTXOs, fee } = getDepositTxInputUTXOsAndFees(
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
        value: input.value,
      },
      // this is needed only if the wallet is in taproot mode
      ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
      sequence: 0xfffffffd, // Enable locktime by setting the sequence value to (RBF-able)
    });
  }

  const scriptTree: Taptree = [
    { output: scripts.transferScript },
    { output: scripts.timelockScript },
  ];

  // Create an pay-2-taproot (p2tr) output using the deposit script
  const depositOutput = payments.p2tr({
    internalPubkey,
    scriptTree,
    network,
  });

  // Add the deposit output to the transaction
  psbt.addOutput({
    address: depositOutput.address!,
    value: amount,
  });

  if (scripts.dataEmbedScript) {
    // Add the data embed output to the transaction
    psbt.addOutput({
      script: scripts.dataEmbedScript,
      value: 0,
    });
  }

  // Add a change output only if there's any amount leftover from the inputs
  const inputsSum = inputValueSum(selectedUTXOs);
  // Check if the change amount is above the dust limit, and if so, add it as a change output
  // console.log(`${inputsSum} ${amount} ${fee}`);
  if ((inputsSum - (amount + fee)) > BTC_DUST_SAT) {
    psbt.addOutput({
      address: changeAddress,
      value: inputsSum - (amount + fee),
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

export function sendTransaction(
  scripts: {
    timelockScript: Buffer,
    transferScript: Buffer,
    dataEmbedScript?: Buffer,
  },
  depositTransaction: Transaction,
  sendAddress: string,
  minimumFee: number,
  network: networks.Network,
  outputIndex: number = 0,
): { psbt: Psbt } {
  const scriptTree: Taptree = [
    { output: scripts.transferScript },
    { output: scripts.timelockScript },
  ];

  if (minimumFee <= 0) {
    throw new Error("Minimum fee must be bigger than 0");
  }

  if (outputIndex < 0) {
    throw new Error("Output index must be bigger or equal to 0");
  }

  const redeem = {
    output: scripts.transferScript,
    redeemVersion: 192,
  };

  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree,
    redeem,
    network,
  });

  const tapLeafScript = {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1],
  };

  const psbt = new Psbt({ network });
  psbt.addInput({
    hash: depositTransaction.getHash(),
    index: outputIndex,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: depositTransaction.outs[0].value,
      script: depositTransaction.outs[0].script,
    },
    tapLeafScript: [tapLeafScript],
  });

  psbt.addOutput({
    address: sendAddress,
    value: depositTransaction.outs[0].value - minimumFee,
  });

  return { psbt }
}

export function recaptureTransferTimelockTransaction(
  scripts: {
    timelockScript: Buffer,
    transferScript: Buffer,
    dataEmbedScript?: Buffer,
  },
  tx: Transaction,
  recaptureAddress: string,
  network: networks.Network,
  feeRate: number,
  outputIndex: number = 0,
): PsbtTransactionResult {
  const scriptTree: Taptree = [
    { output: scripts.transferScript },
    { output: scripts.timelockScript },
  ];

  return recaptureTransaction(
    scripts,
    scriptTree,
    tx,
    recaptureAddress,
    network,
    feeRate,
    outputIndex,
  );
}

function recaptureTransaction(
  scripts: {
    timelockScript: Buffer,
  },
  scriptTree: Taptree,
  tx: Transaction,
  recaptureAddress: string,
  network: networks.Network,
  feeRate: number,
  outputIndex: number = 0,
): PsbtTransactionResult {
  // Check that recapture feeRate is bigger than 0
  if (feeRate <= 0) {
    throw new Error("Recapture feeRate must be bigger than 0");
  }

  // Check that outputIndex is bigger or equal to 0
  if (outputIndex < 0) {
    throw new Error("Output index must be bigger or equal to 0");
  }

  // position of time in the timelock script
  const timePosition = 2;
  const decompiled  = script.decompile(scripts.timelockScript);

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
    redeemVersion: 192,
  };

  const p2tr = payments.p2tr({
    internalPubkey,
    scriptTree,
    redeem,
    network,
  });

  const tapLeafScript = {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1],
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
      script: tx.outs[outputIndex].script,
    },
    tapLeafScript: [tapLeafScript],
    sequence: timelock,
  });

  const outputValue = tx.outs[outputIndex].value;
  if (outputValue < BTC_DUST_SAT) {
    throw new Error("Output value is less than dust limit");
  }
  // recapture tx always has 1 output only
  const estimatedFee = getEstimatedFee(feeRate, psbt.txInputs.length, 1);
  console.log(`estimatedFee ${estimatedFee}, value`, tx.outs[outputIndex].value);
  psbt.addOutput({
    address: recaptureAddress,
    value: tx.outs[outputIndex].value - estimatedFee,
  });

  return {
    psbt,
    fee: estimatedFee
  };
}
