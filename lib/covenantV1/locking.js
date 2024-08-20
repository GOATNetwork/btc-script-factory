"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalUnbondingTransaction = exports.withdrawalTimeLockTransaction = exports.lockingTransaction = exports.buildLockingScript = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const locking_script_1 = require("./locking.script");
Object.defineProperty(exports, "buildLockingScript", { enumerable: true, get: function () { return locking_script_1.buildLockingScript; } });
const fee_1 = require("../utils/fee");
const constants_1 = require("../constants");
function lockingTransaction(scripts, amount, changeAddress, inputUTXOs, network, feeRate, lockHeight) {
    // Check that amount and fee are bigger than 0
    if (amount <= 0 || feeRate <= 0) {
        throw new Error("Amount and fee rate must be bigger than 0");
    }
    // Check whether the change address is a valid Bitcoin address.
    if (!bitcoinjs_lib_1.address.toOutputScript(changeAddress, network)) {
        throw new Error("Invalid change address");
    }
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    const p2wsh = bitcoinjs_lib_1.payments.p2wsh({
        redeem: { output: scripts.lockingScript, network },
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
    // Add the locking output to the transaction
    psbt.addOutput({
        address: p2wsh.address,
        value: amount
    });
    // Set the locktime field if provided. If not provided, the locktime will be set to 0 by default
    // Only height based locktime is supported
    if (lockHeight) {
        if (lockHeight >= constants_1.BTC_LOCKTIME_HEIGHT_TIME_CUTOFF) {
            throw new Error("Invalid lock height");
        }
        psbt.setLocktime(lockHeight);
    }
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
exports.lockingTransaction = lockingTransaction;
function withdrawalTimeLockTransaction(scripts, lockingTransaction, withdrawalAddress, minimumFee, network, outputIndex = 0) {
    if (minimumFee <= 0) {
        throw new Error("Minimum fee must be bigger than 0");
    }
    const decompiled = bitcoinjs_lib_1.script.decompile(scripts.lockingScript);
    if (!decompiled) {
        throw new Error("Timelock script is not valid");
    }
    // position of time in the timelock script
    const timePosition = 5;
    let timelock = 0;
    if (Buffer.isBuffer(decompiled[timePosition])) {
        const timeBuffer = decompiled[timePosition];
        timelock = bitcoinjs_lib_1.script.number.decode(timeBuffer);
    }
    else {
        // in case timelock is <= 16 it will be a number, not a buffer
        const wrap = decompiled[timePosition] % 16;
        timelock = wrap === 0 ? 16 : wrap;
    }
    if (Number.isNaN(timelock) || timelock < 0 || timelock > 65535) {
        throw new Error("Timelock script is not valid");
    }
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    psbt.addInput({
        hash: lockingTransaction.getId(),
        index: outputIndex,
        witnessUtxo: {
            value: lockingTransaction.outs[outputIndex].value,
            script: lockingTransaction.outs[outputIndex].script
        },
        witnessScript: scripts.lockingScript, // Adding witnessScript here
        sequence: timelock
    });
    const outputValue = lockingTransaction.outs[outputIndex].value - minimumFee;
    if (outputValue < 0) {
        throw new Error("Output value is smaller than minimum fee");
    }
    if (outputValue < constants_1.BTC_DUST_SAT) {
        throw new Error("Output value is smaller than dust");
    }
    psbt.addOutput({
        address: withdrawalAddress,
        value: outputValue
    });
    return { psbt };
}
exports.withdrawalTimeLockTransaction = withdrawalTimeLockTransaction;
function withdrawalUnbondingTransaction(scripts, lockingTransaction, withdrawalAddress, transactionFee, network, outputIndex = 0) {
    // Check that transaction fee is bigger than 0
    if (transactionFee <= 0) {
        throw new Error("Unbonding fee must be bigger than 0");
    }
    // Check that outputIndex is bigger or equal to 0
    if (outputIndex < 0) {
        throw new Error("Output index must be bigger or equal to 0");
    }
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    psbt.addInput({
        hash: lockingTransaction.getId(),
        index: outputIndex,
        witnessUtxo: {
            value: lockingTransaction.outs[outputIndex].value,
            script: lockingTransaction.outs[outputIndex].script
        },
        witnessScript: scripts.lockingScript // Adding witnessScript here
    });
    const outputValue = lockingTransaction.outs[outputIndex].value - transactionFee;
    if (outputValue < 0) {
        throw new Error("Output value is smaller than minimum fee");
    }
    if (outputValue < constants_1.BTC_DUST_SAT) {
        throw new Error("Output value is smaller than dust");
    }
    psbt.addOutput({
        address: withdrawalAddress,
        value: outputValue
    });
    return { psbt };
}
exports.withdrawalUnbondingTransaction = withdrawalUnbondingTransaction;
