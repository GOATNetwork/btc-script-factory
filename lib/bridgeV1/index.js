"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTransaction = exports.depositTransaction = exports.BridgeV1ScriptData = exports.initBTCCurve = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const curve_1 = require("./utils/curve");
Object.defineProperty(exports, "initBTCCurve", { enumerable: true, get: function () { return curve_1.initBTCCurve; } });
const bridgeV1Script_1 = require("./utils/bridgeV1Script");
Object.defineProperty(exports, "BridgeV1ScriptData", { enumerable: true, get: function () { return bridgeV1Script_1.BridgeV1ScriptData; } });
const fee_1 = require("./utils/fee");
// https://bips.xyz/370
const BTC_LOCKTIME_HEIGHT_TIME_CUTOFF = 500000000;
const BTC_DUST_SAT = 546;
function depositTransaction(scripts, amount, changeAddress, inputUTXOs, network, feeRate, publicKeyNoCoord, lockHeight) {
    if (amount <= 0 || feeRate <= 0) {
        throw new Error("Amount and fee rate must be bigger than 0");
    }
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    const p2wsh = bitcoinjs_lib_1.payments.p2wsh({
        redeem: bitcoinjs_lib_1.payments.p2ms({
            output: scripts.depositScript,
            network
        }),
        network
    });
    const { selectedUTXOs, fee } = (0, fee_1.getDepositTxInputUTXOsAndFees)(inputUTXOs, amount, feeRate, 2);
    selectedUTXOs.forEach((input) => {
        psbt.addInput({
            hash: input.txid,
            index: input.vout,
            witnessUtxo: {
                script: Buffer.from(input.scriptPubKey, "hex"),
                value: input.value
            },
            redeemScript: p2wsh.redeem.output,
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
