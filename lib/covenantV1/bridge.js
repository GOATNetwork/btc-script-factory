"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTransaction = exports.depositTransaction = exports.buildDepositScript = exports.initBTCCurve = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const curve_1 = require("../utils/curve");
Object.defineProperty(exports, "initBTCCurve", { enumerable: true, get: function () { return curve_1.initBTCCurve; } });
const bridge_script_1 = require("./bridge.script");
Object.defineProperty(exports, "buildDepositScript", { enumerable: true, get: function () { return bridge_script_1.buildDepositScript; } });
const fee_1 = require("../utils/fee");
// https://bips.xyz/370
const BTC_DUST_SAT = 546;
function depositTransaction(scripts, amount, changeAddress, inputUTXOs, network, feeRate) {
    if (amount <= 0 || feeRate <= 0) {
        throw new Error("Amount and fee rate must be bigger than 0");
    }
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    const p2wsh = bitcoinjs_lib_1.payments.p2wsh({
        redeem: { output: scripts.depositScript, network },
        network
    });
    const { selectedUTXOs, fee } = (0, fee_1.getTxInputUTXOsAndFees)(inputUTXOs, amount, feeRate, 2);
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
        address: p2wsh.address,
        value: amount
    });
    const inputsSum = (0, fee_1.inputValueSum)(selectedUTXOs);
    if ((inputsSum - (amount + fee)) > BTC_DUST_SAT) {
        psbt.addOutput({
            address: changeAddress,
            value: inputsSum - (amount + fee)
        });
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
