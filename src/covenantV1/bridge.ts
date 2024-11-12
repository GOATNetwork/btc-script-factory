import {
  payments,
  Psbt,
  Transaction,
  networks
} from "bitcoinjs-lib";

import { buildDataEmbedScript, buildDepositScript, parseDataEmbedScript } from "./bridge.script";
import { UTXO } from "../types/UTXO";
import { inputValueSum } from "../utils/fee";
import { BTC_DUST_SAT, ONLY_X_PK_LENGTH } from "../constants";
import { getSpendTxInputUTXOsAndFees } from "../utils/feeV1";

export { buildDepositScript, buildDataEmbedScript, parseDataEmbedScript };

/**
 * Creates a deposit transaction with the specified parameters.
 * @param {Object} scripts - The scripts used for the transaction.
 * @param {Buffer} scripts.depositScript - The deposit script.
 * @param {number} amount - The amount to deposit in satoshis. Must be a non-negative integer greater than 0.
 * @param {string} changeAddress - The address to send any change back to.
 * @param {UTXO[]} inputUTXOs - The list of input UTXOs.
 * @param {networks.Network} network - The Bitcoin network to use.
 * @param {number} feeRate - The fee rate in satoshis per byte. Must be a non-negative integer greater than 0.
 * @param {Buffer} [publicKeyNoCoord] - The public key without the co-ordinate.
 * @return {PsbtTransactionResult} - The PSBT transaction result containing the PSBT and the calculated fee.
 */
export function depositTransaction(
  scripts: {
    depositScript: Buffer,
  },
  amount: number,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  feeRate: number,
  publicKeyNoCoord?: Buffer
) {
  // Check that amount and fee rate are non-negative integers greater than 0
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(feeRate) || feeRate <= 0) {
    throw new Error("Amount and fee rate must be non-negative integers greater than 0");
  }

  // Check whether the public key is valid
  if (publicKeyNoCoord && publicKeyNoCoord.length !== ONLY_X_PK_LENGTH) {
    throw new Error("Invalid public key");
  }

  const psbt = new Psbt({ network });

  const p2wsh = payments.p2wsh({
    redeem: { output: scripts.depositScript, network },
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
    const newInput: any = {
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, "hex"),
        value: input.value
      },
      // this is needed only if the wallet is in taproot mode
      ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
      sequence: 0xfffffffd // Enable locktime by setting the sequence value to (RBF-able)
    };
    if (input.redeemScript) {
      newInput.redeemScript = input.redeemScript;
    }
    if (input.rawTransaction) {
      newInput.nonWitnessUtxo = Buffer.from(input.rawTransaction, "hex");
    }
    psbt.addInput(newInput);
  });

  // Add outputs to the recipient
  psbt.addOutputs(psbtOutputs);

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

/**
 * Creates a transaction to deposit funds to a fixed address with an optional data embedding script.
 * @param {Object} scripts - Scripts used in the transaction.
 * @param {Buffer} scripts.dataEmbedScript - The data embedding script.
 * @param {number} amount - The amount of funds to deposit. Must be greater than 0.
 * @param {string} fixedAddress - The fixed address to deposit funds to.
 * @param {string} changeAddress - The address to send any change back to.
 * @param {UTXO[]} inputUTXOs - Array of input UTXOs.
 * @param {networks.Network} network - The network to use for the transaction.
 * @param {number} feeRate - The fee rate for the transaction. Must be greater than 0.
 * @param {Buffer} [publicKeyNoCoord] - The public key without the co-ordinate.
 * @return {Object} - An object containing the PSBT and the calculated fee.
 */
export function depositToFixedAddressTransaction(
  scripts: {
    dataEmbedScript: Buffer
  },
  amount: number,
  fixedAddress: string,
  changeAddress: string,
  inputUTXOs: UTXO[],
  network: networks.Network,
  feeRate: number,
  publicKeyNoCoord?: Buffer
) {
  // Check that amount and fee rate are non-negative integers greater than 0
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(feeRate) || feeRate <= 0) {
    throw new Error("Amount and fee rate must be non-negative integers greater than 0");
  }

  // Check whether the public key is valid
  if (publicKeyNoCoord && publicKeyNoCoord.length !== ONLY_X_PK_LENGTH) {
    throw new Error("Invalid public key");
  }

  const psbt = new Psbt({ network });

  const psbtOutputs = [
    {
      address: fixedAddress,
      value: amount
    },
    {
      script: scripts.dataEmbedScript,
      value: 0
    }
  ];

  const { selectedUTXOs, fee } = getSpendTxInputUTXOsAndFees(network, inputUTXOs, amount, feeRate, psbtOutputs);

  selectedUTXOs.forEach((input: UTXO) => {
    const newInput: any = {
      hash: input.txid,
      index: input.vout,
      witnessUtxo: {
        script: Buffer.from(input.scriptPubKey, "hex"),
        value: input.value
      },
      // this is needed only if the wallet is in taproot mode
      ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
      sequence: 0xfffffffd // Enable locktime by setting the sequence value to (RBF-able)
    };
    if (input.redeemScript) {
      newInput.redeemScript = input.redeemScript;
    }
    if (input.rawTransaction) {
      newInput.nonWitnessUtxo = Buffer.from(input.rawTransaction, "hex");
    }
    psbt.addInput(newInput);
  });

  // Add outputs to the recipient
  psbt.addOutputs(psbtOutputs);

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

