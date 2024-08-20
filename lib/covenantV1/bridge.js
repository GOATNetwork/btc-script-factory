"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTransaction = exports.depositTransaction = exports.buildDepositScript = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const bridge_script_1 = require("./bridge.script");
Object.defineProperty(exports, "buildDepositScript", { enumerable: true, get: function () { return bridge_script_1.buildDepositScript; } });
const fee_1 = require("../utils/fee");
const constants_1 = require("../constants");
function depositTransaction(scripts, amount, changeAddress, inputUTXOs, network, feeRate) {
    if (amount <= 0 || feeRate <= 0) {
        throw new Error("Amount and fee rate must be bigger than 0");
    }
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    const p2wsh = bitcoinjs_lib_1.payments.p2wsh({
        redeem: { output: scripts.depositScript, network },
        network
    });
    // Estimate fees with an assumed output count (initially 2 for recipient + change)
    let estimatedOutputs = 2;
    const { selectedUTXOs, fee } = (0, fee_1.getTxInputUTXOsAndFees)(inputUTXOs, amount, feeRate, estimatedOutputs);
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
    // Add output to the recipient
    psbt.addOutput({
        address: p2wsh.address,
        value: amount
    });
    // Calculate the change
    const inputsSum = (0, fee_1.inputValueSum)(selectedUTXOs);
    const change = inputsSum - (amount + fee);
    // Dynamically decide whether to add a change output
    if (change > constants_1.BTC_DUST_SAT) {
        psbt.addOutput({
            address: changeAddress,
            value: change
        });
    }
    else {
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
exports.depositTransaction = depositTransaction;
function sendTransaction(scripts, depositTransaction, sendAddress, minimumFee, network, outputIndex = 0) {
    if (minimumFee <= 0) {
        throw new Error("Minimum fee must be bigger than 0");
    }
    // Ensure that the minimum fee does not exceed the output value
    const outputValue = depositTransaction.outs[outputIndex].value;
    if (minimumFee >= outputValue) {
        throw new Error("Minimum fee must be less than the output value");
    }
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
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
exports.sendTransaction = sendTransaction;
