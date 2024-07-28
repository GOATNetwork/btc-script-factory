"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withdrawalUnbondingTransactionByTx = exports.withdrawalTimeLockTransactionByTx = exports.withdrawalUnbondingTransaction = exports.withdrawalTimeLockTransaction = exports.stakingTransaction = exports.buildDepositScript = exports.initBTCCurve = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const curve_1 = require("./utils/curve");
Object.defineProperty(exports, "initBTCCurve", { enumerable: true, get: function () { return curve_1.initBTCCurve; } });
const bridge_script_1 = require("./utils/bridge.script");
Object.defineProperty(exports, "buildDepositScript", { enumerable: true, get: function () { return bridge_script_1.buildDepositScript; } });
const fee_1 = require("./utils/fee");
// https://bips.xyz/370
const BTC_LOCKTIME_HEIGHT_TIME_CUTOFF = 500000000;
const BTC_DUST_SAT = 546;
function stakingTransaction(scripts, amount, changeAddress, inputUTXOs, network, feeRate, lockHeight) {
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
        redeem: { output: scripts.stakingScript, network },
        network
    });
    const { selectedUTXOs, fee } = (0, fee_1.getDepositTxInputUTXOsAndFees)(inputUTXOs, amount, feeRate, 2);
    console.log(selectedUTXOs);
    selectedUTXOs.forEach((input) => {
        psbt.addInput({
            hash: input.txid,
            index: input.vout,
            witnessUtxo: {
                script: Buffer.from(input.scriptPubKey, "hex"),
                value: input.value
            },
            redeemScript: scripts.stakingScript,
            sequence: 0xfffffffd // Enable locktime by setting the sequence value to (RBF-able)
        });
    });
    // Add the staking output to the transaction
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
exports.stakingTransaction = stakingTransaction;
function withdrawalTimeLockTransaction(scripts, stakingTransaction, withdrawalAddress, minimumFee, network, outputIndex = 0) {
    if (minimumFee <= 0) {
        throw new Error("Minimum fee must be bigger than 0");
    }
    const decompiled = bitcoinjs_lib_1.script.decompile(scripts.stakingScript);
    if (!decompiled) {
        throw new Error("Timelock script is not valid");
    }
    // position of time in the timelock script
    const timePosition = 4;
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
    console.log("Timelock:", timelock);
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    psbt.addInput({
        hash: stakingTransaction.getHash(),
        index: outputIndex,
        witnessUtxo: {
            value: stakingTransaction.outs[outputIndex].value,
            script: stakingTransaction.outs[outputIndex].script
        },
        witnessScript: scripts.stakingScript, // Adding witnessScript here
        sequence: timelock
    });
    psbt.addOutput({
        address: withdrawalAddress,
        value: stakingTransaction.outs[outputIndex].value - minimumFee
    });
    return { psbt };
}
exports.withdrawalTimeLockTransaction = withdrawalTimeLockTransaction;
function withdrawalUnbondingTransaction(scripts, stakingTransaction, withdrawalAddress, transactionFee, network, outputIndex = 0) {
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
        hash: stakingTransaction.getHash(),
        index: outputIndex,
        witnessUtxo: {
            value: stakingTransaction.outs[outputIndex].value,
            script: stakingTransaction.outs[outputIndex].script
        },
        witnessScript: scripts.stakingScript // Adding witnessScript here
    });
    psbt.addOutput({
        address: withdrawalAddress,
        value: stakingTransaction.outs[outputIndex].value - transactionFee
    });
    return { psbt };
}
exports.withdrawalUnbondingTransaction = withdrawalUnbondingTransaction;
function withdrawalTimeLockTransactionByTx(scripts, stakingTransaction, withdrawalAddress, minimumFee, network, outputIndex = 0) {
    if (minimumFee <= 0) {
        throw new Error("Minimum fee must be bigger than 0");
    }
    const decompiled = bitcoinjs_lib_1.script.decompile(scripts.stakingScript);
    if (!decompiled) {
        throw new Error("Timelock script is not valid");
    }
    const timePosition = 5;
    let timelock = 0;
    if (Buffer.isBuffer(decompiled[timePosition])) {
        const timeBuffer = decompiled[timePosition];
        timelock = bitcoinjs_lib_1.script.number.decode(timeBuffer);
    }
    else {
        const wrap = decompiled[timePosition] % 16;
        timelock = wrap === 0 ? 16 : wrap;
    }
    console.log("Timelock:", timelock);
    const transaction = new bitcoinjs_lib_1.Transaction();
    transaction.addInput(stakingTransaction.getHash(), outputIndex, timelock);
    transaction.addOutput(bitcoinjs_lib_1.address.toOutputScript(withdrawalAddress, network), stakingTransaction.outs[outputIndex].value - minimumFee);
    return { transaction };
}
exports.withdrawalTimeLockTransactionByTx = withdrawalTimeLockTransactionByTx;
function withdrawalUnbondingTransactionByTx(scripts, stakingTransaction, withdrawalAddress, transactionFee, network, outputIndex = 0) {
    if (transactionFee <= 0) {
        throw new Error("Transaction fee must be bigger than 0");
    }
    if (outputIndex < 0) {
        throw new Error("Output index must be bigger or equal to 0");
    }
    const transaction = new bitcoinjs_lib_1.Transaction();
    transaction.addInput(stakingTransaction.getHash(), outputIndex, bitcoinjs_lib_1.Transaction.DEFAULT_SEQUENCE, stakingTransaction.outs[outputIndex].script);
    transaction.addOutput(bitcoinjs_lib_1.address.toOutputScript(withdrawalAddress, network), stakingTransaction.outs[outputIndex].value - transactionFee);
    return { transaction };
}
exports.withdrawalUnbondingTransactionByTx = withdrawalUnbondingTransactionByTx;
