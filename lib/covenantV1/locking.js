"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLockingScript = void 0;
exports.lockingTransaction = lockingTransaction;
exports.withdrawalTimeLockTransaction = withdrawalTimeLockTransaction;
exports.withdrawalUnbondingTransaction = withdrawalUnbondingTransaction;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const locking_script_1 = require("./locking.script");
Object.defineProperty(exports, "buildLockingScript", { enumerable: true, get: function () { return locking_script_1.buildLockingScript; } });
const fee_1 = require("../utils/fee");
const constants_1 = require("../constants");
const feeV1_1 = require("../utils/feeV1");
function lockingTransaction(scripts, amount, changeAddress, inputUTXOs, network, feeRate, publicKeyNoCoord, lockHeight) {
    // Check that amount and fee rate are non-negative integers greater than 0
    if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(feeRate) || feeRate <= 0) {
        throw new Error("Amount and fee rate must be non-negative integers greater than 0");
    }
    // Check whether the change address is a valid Bitcoin address.
    if (!bitcoinjs_lib_1.address.toOutputScript(changeAddress, network)) {
        throw new Error("Invalid change address");
    }
    // Check whether the public key is valid
    if (publicKeyNoCoord && publicKeyNoCoord.length !== constants_1.ONLY_X_PK_LENGTH) {
        throw new Error("Invalid public key");
    }
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    const p2wsh = bitcoinjs_lib_1.payments.p2wsh({
        redeem: { output: scripts.lockingScript, network },
        network
    });
    const psbtOutputs = [
        {
            address: p2wsh.address,
            value: amount
        }
    ];
    const { selectedUTXOs, fee } = (0, feeV1_1.getSpendTxInputUTXOsAndFees)(network, inputUTXOs, amount, feeRate, psbtOutputs);
    selectedUTXOs.forEach((input) => {
        const newInput = {
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
    // Add the locking output to the transaction
    psbt.addOutputs(psbtOutputs);
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
function withdrawalTimeLockTransaction(scripts, lockingTransaction, withdrawalAddress, feeRate, network, outputIndex = 0) {
    if (feeRate <= 0) {
        throw new Error("fee rate must be bigger than 0");
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
    const estimatedFee = (0, feeV1_1.getWithdrawTxFee)(feeRate, lockingTransaction.outs[outputIndex].script);
    const outputValue = lockingTransaction.outs[outputIndex].value - estimatedFee;
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
function withdrawalUnbondingTransaction(scripts, lockingTransaction, withdrawalAddress, feeRate, network, outputIndex = 0) {
    if (feeRate <= 0) {
        throw new Error("fee rate must be bigger than 0");
    }
    if (outputIndex < 0 || outputIndex >= lockingTransaction.outs.length) {
        throw new Error("Output index is out of bounds");
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
    const estimatedFee = (0, feeV1_1.getWithdrawTxFee)(feeRate, lockingTransaction.outs[outputIndex].script, scripts.dataEmbedScript);
    const outputValue = lockingTransaction.outs[outputIndex].value - estimatedFee;
    if (outputValue < constants_1.BTC_DUST_SAT) {
        throw new Error("Output value is smaller than dust");
    }
    psbt.addOutput({
        address: withdrawalAddress,
        value: outputValue
    });
    if (scripts.dataEmbedScript) {
        psbt.addOutput({
            script: scripts.dataEmbedScript,
            value: 0
        });
    }
    return { psbt };
}
