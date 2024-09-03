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
import { PK_LENGTH, BridgeScriptData } from "./script";
import { PsbtTransactionResult } from "../../types/transaction";
import { UTXO } from "../../types/UTXO";
import { getEstimatedFee, inputValueSum, getTxInputUTXOsAndFees } from "../../utils/fee";
import { BTC_DUST_SAT, BTC_LOCKTIME_HEIGHT_TIME_CUTOFF } from "../../constants";

export { BridgeScriptData };

export function depositTransaction(
  scripts: {
    timelockScript: Buffer,
    transferScript: Buffer,
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
  // We have 2 outputs by default: deposit output and change output
  const numOutputs = scripts.provablyNoteScript? 3 : 2;
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
    { output: scripts.transferScript },
    { output: scripts.timelockScript }
  ];

  // Create an pay-2-taproot (p2tr) output using the deposit script
  const depositOutput = payments.p2tr({
    internalPubkey,
    scriptTree,
    network
  });

  // Add the deposit output to the transaction
  psbt.addOutput({
    address: depositOutput.address!,
    value: amount
  });

  if (scripts.provablyNoteScript) {
    // Add the data output to the transaction
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

export function sendTransaction(
  scripts: {
    timelockScript: Buffer,
    transferScript: Buffer,
    provablyNoteScript?: Buffer,
  },
  depositTransaction: Transaction,
  sendAddress: string,
  minimumFee: number,
  network: networks.Network,
  outputIndex: number = 0
): { psbt: Psbt } {
  const scriptTree: Taptree = [
    { output: scripts.transferScript },
    { output: scripts.timelockScript }
  ];

  if (minimumFee <= 0) {
    throw new Error("Minimum fee must be bigger than 0");
  }

  if (outputIndex < 0) {
    throw new Error("Output index must be bigger or equal to 0");
  }

  const redeem = {
    output: scripts.transferScript,
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
    hash: depositTransaction.getHash(),
    index: outputIndex,
    tapInternalKey: internalPubkey,
    witnessUtxo: {
      value: depositTransaction.outs[0].value,
      script: depositTransaction.outs[0].script
    },
    tapLeafScript: [tapLeafScript]
  });

  psbt.addOutput({
    address: sendAddress,
    value: depositTransaction.outs[0].value - minimumFee
  });

  return { psbt }
}

export function recaptureTransferTimelockTransaction(
  scripts: {
    timelockScript: Buffer,
    transferScript: Buffer,
    provablyNoteScript?: Buffer,
  },
  tx: Transaction,
  recaptureAddress: string,
  network: networks.Network,
  feeRate: number,
  outputIndex: number = 0
): PsbtTransactionResult {
  const scriptTree: Taptree = [
    { output: scripts.transferScript },
    { output: scripts.timelockScript }
  ];

  return recaptureTransaction(
    scripts,
    scriptTree,
    tx,
    recaptureAddress,
    network,
    feeRate,
    outputIndex
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
  outputIndex: number = 0
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

  const outputValue = tx.outs[outputIndex].value;
  if (outputValue < BTC_DUST_SAT) {
    throw new Error("Output value is less than dust limit");
  }
  // recapture tx always has 1 output only
  const estimatedFee = getEstimatedFee(feeRate, psbt.txInputs.length, 1);

  psbt.addOutput({
    address: recaptureAddress,
    value: tx.outs[outputIndex].value - estimatedFee
  });

  return {
    psbt,
    fee: estimatedFee
  };
}

function createP2MS(pks: string[], m: number, network: networks.Network) {
  const p2ms = payments.p2ms({
    m: m,
    pubkeys: pks.map((pk) => Buffer.from(pk, "hex")),
    network: network
  });

  const p2sh = payments.p2wsh({
    redeem: p2ms,
    network: network
  });

  return {
    address: p2sh.address,
    redeemScript: p2ms.output,
    p2sh: p2sh
  };
}


export function depositP2SHTransaction(
  scripts: {
    provablyNoteScript?: Buffer,
  },
  amount: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  feeRate: number,
  pubKeys: string[],
  m: number
) {
  // Check that amount and fee rate are non-negative integers greater than 0
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(feeRate) || feeRate <= 0) {
    throw new Error("Amount and fee rate must be non-negative integers greater than 0");
  }

  const numOutputs = scripts.provablyNoteScript? 3 : 2;
  const p2ms = createP2MS(pubKeys, m, network);
  const { selectedUTXOs, fee } = getTxInputUTXOsAndFees(inputUTXOs, amount, feeRate, numOutputs);

  const psbt = new Psbt({ network });
  selectedUTXOs.forEach((input) => {
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, "hex"),
        value: input.value
      },
      redeemScript: p2ms.redeemScript
    });
  });

  psbt.addOutput({
    address: p2ms.address!,
    value: amount
  });

  if (scripts.provablyNoteScript) {
    psbt.addOutput({
      script: scripts.provablyNoteScript,
      value: 0
    });
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
  }
}

export function sendP2SHTransaction(
  depositTransaction: Transaction,
  sendAddress: string,
  minimumFee: number,
  network: networks.Network,
  outputIndex = 0,
  pubKeys: string[],
  m: number
) {
  if (minimumFee <= 0) {
    throw new Error("Minimum fee must be bigger than 0");
  }

  const p2ms = createP2MS(pubKeys, m, network);

  const psbt = new Psbt({ network });
  psbt.addInput({
    hash: depositTransaction.getHash(),
    index: outputIndex,
    witnessUtxo: {
      value: depositTransaction.outs[0].value,
      script: depositTransaction.outs[0].script
    },
    witnessScript: p2ms.redeemScript // Adding witnessScript here
    // redeemScript: p2ms.redeemScript, // Make sure to NOT set scriptSig, it should be empty for witness inputs
  });

  psbt.addOutput({
    address: sendAddress,
    value: depositTransaction.outs[0].value - minimumFee
  });

  return { psbt };
}

export function depositP2PKHTransaction(
  scripts: {
    provablyNoteScript?: Buffer,
  },
  amount: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  feeRate: number,
  keyPair: any
) {
  // Check that amount and fee rate are non-negative integers greater than 0
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(feeRate) || feeRate <= 0) {
    throw new Error("Amount and fee rate must be non-negative integers greater than 0");
  }

  // Calculate the number of outputs based on the presence of the provably note script
  // We have 2 outputs by default: deposit output and change output
  const numOutputs = scripts.provablyNoteScript? 3 : 2;
  const { selectedUTXOs, fee } = getTxInputUTXOsAndFees(
    inputUTXOs, amount, feeRate, numOutputs
  );

  const { address } = payments.p2pkh({ pubkey: keyPair.publicKey, network });


  const psbt = new Psbt({ network })

  for (let i = 0; i < selectedUTXOs.length; ++i) {
    const input = selectedUTXOs[i];
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      nonWitnessUtxo: Buffer.from(input.rawTransaction!, "hex"),
      sequence: 0xfffffffd // Enable locktime by setting the sequence value to (RBF-able)
    });
  }

  psbt.addOutput({
    address: address!,
    value: amount
  });

  if (scripts.provablyNoteScript) {
    // Add the provably note output to the transaction
    psbt.addOutput({
      script: scripts.provablyNoteScript,
      value: 0
    });
  }

  // Add a change output only if there's any amount leftover from the inputs
  const inputsSum = inputValueSum(selectedUTXOs);
  // Check if the change amount is above the dust limit, and if so, add it as a change output
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

export function sendP2PKHTransaction(
  depositTransaction: Transaction,
  sendAddress: string,
  minimumFee: number,
  network: networks.Network,
  outputIndex: number = 0
): { psbt: Psbt } {
  const psbt = new Psbt({ network });

  if (!depositTransaction.outs[outputIndex]) {
    throw new Error("Invalid outputIndex: no such output in the transaction");
  }

  const output = depositTransaction.outs[outputIndex];

  psbt.addInput({
    hash: depositTransaction.getId(),
    index: outputIndex,
    nonWitnessUtxo: Buffer.from(depositTransaction.toHex(), "hex")
  });

  const inputAmount = output.value;

  const outputAmount = inputAmount - minimumFee;
  if (outputAmount <= 0) {
    throw new Error("Output amount must be greater than 0 after fees");
  }

  psbt.addOutput({
    address: sendAddress,
    value: outputAmount
  });

  return { psbt };
}
