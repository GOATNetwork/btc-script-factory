"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendP2PKHTransaction = exports.depositP2PKHTransaction = exports.sendP2SHTransaction = exports.depositP2SHTransaction = exports.recaptureTransferTimelockTransaction = exports.sendTransaction = exports.depositTransaction = exports.BridgeScriptData = exports.initBTCCurve = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const internalPubkey_1 = require("./constants/internalPubkey");
const curve_1 = require("./utils/curve");
Object.defineProperty(exports, "initBTCCurve", { enumerable: true, get: function () { return curve_1.initBTCCurve; } });
const bridgeScript_1 = require("./utils/bridgeScript");
Object.defineProperty(exports, "BridgeScriptData", { enumerable: true, get: function () { return bridgeScript_1.BridgeScriptData; } });
const fee_1 = require("./utils/fee");
// https://bips.xyz/370
const BTC_LOCKTIME_HEIGHT_TIME_CUTOFF = 500000000;
const BTC_DUST_SAT = 546;
function depositTransaction(scripts, amount, changeAddress, inputUTXOs, network, feeRate, publicKeyNoCoord, lockHeight) {
    // Check that amount and fee are bigger than 0
    if (amount <= 0 || feeRate <= 0) {
        throw new Error("Amount and fee rate must be bigger than 0");
    }
    // Check whether the change address is a valid Bitcoin address.
    if (!bitcoinjs_lib_1.address.toOutputScript(changeAddress, network)) {
        throw new Error("Invalid change address");
    }
    // Check whether the public key is valid
    if (publicKeyNoCoord && publicKeyNoCoord.length !== bridgeScript_1.PK_LENGTH) {
        throw new Error("Invalid public key");
    }
    // Calculate the number of outputs based on the presence of the data embed script
    // We have 2 outputs by default: deposit output and change output
    const numOutputs = scripts.dataEmbedScript ? 3 : 2;
    const { selectedUTXOs, fee } = (0, fee_1.getDepositTxInputUTXOsAndFees)(inputUTXOs, amount, feeRate, numOutputs);
    // Create a partially signed transaction
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
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
    const scriptTree = [
        { output: scripts.transferScript },
        { output: scripts.timelockScript },
    ];
    // Create an pay-2-taproot (p2tr) output using the deposit script
    const depositOutput = bitcoinjs_lib_1.payments.p2tr({
        internalPubkey: internalPubkey_1.internalPubkey,
        scriptTree,
        network,
    });
    // Add the deposit output to the transaction
    psbt.addOutput({
        address: depositOutput.address,
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
    const inputsSum = (0, fee_1.inputValueSum)(selectedUTXOs);
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
exports.depositTransaction = depositTransaction;
function sendTransaction(scripts, depositTransaction, sendAddress, minimumFee, network, outputIndex = 0) {
    const scriptTree = [
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
    const p2tr = bitcoinjs_lib_1.payments.p2tr({
        internalPubkey: internalPubkey_1.internalPubkey,
        scriptTree,
        redeem,
        network,
    });
    const tapLeafScript = {
        leafVersion: redeem.redeemVersion,
        script: redeem.output,
        controlBlock: p2tr.witness[p2tr.witness.length - 1],
    };
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    psbt.addInput({
        hash: depositTransaction.getHash(),
        index: outputIndex,
        tapInternalKey: internalPubkey_1.internalPubkey,
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
    return { psbt };
}
exports.sendTransaction = sendTransaction;
function recaptureTransferTimelockTransaction(scripts, tx, recaptureAddress, network, feeRate, outputIndex = 0) {
    const scriptTree = [
        { output: scripts.transferScript },
        { output: scripts.timelockScript },
    ];
    return recaptureTransaction(scripts, scriptTree, tx, recaptureAddress, network, feeRate, outputIndex);
}
exports.recaptureTransferTimelockTransaction = recaptureTransferTimelockTransaction;
function recaptureTransaction(scripts, scriptTree, tx, recaptureAddress, network, feeRate, outputIndex = 0) {
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
    const decompiled = bitcoinjs_lib_1.script.decompile(scripts.timelockScript);
    if (!decompiled) {
        throw new Error("Timelock script is not valid");
    }
    let timelock = 0;
    // if the timelock is a buffer, it means it's a number bigger than 16 blocks
    if (typeof decompiled[timePosition] !== "number") {
        const timeBuffer = decompiled[timePosition];
        timelock = bitcoinjs_lib_1.script.number.decode(timeBuffer);
    }
    else {
        // in case timelock is <= 16 it will be a number, not a buffer
        const wrap = decompiled[timePosition] % 16;
        timelock = wrap === 0 ? 16 : wrap;
    }
    const redeem = {
        output: scripts.timelockScript,
        redeemVersion: 192,
    };
    const p2tr = bitcoinjs_lib_1.payments.p2tr({
        internalPubkey: internalPubkey_1.internalPubkey,
        scriptTree,
        redeem,
        network,
    });
    const tapLeafScript = {
        leafVersion: redeem.redeemVersion,
        script: redeem.output,
        controlBlock: p2tr.witness[p2tr.witness.length - 1],
    };
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    // only transactions with version 2 can trigger OP_CHECKSEQUENCEVERIFY
    // https://github.com/btcsuite/btcd/blob/master/txscript/opcode.go#L1174
    psbt.setVersion(2);
    psbt.addInput({
        hash: tx.getHash(),
        index: outputIndex,
        tapInternalKey: internalPubkey_1.internalPubkey,
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
    const estimatedFee = (0, fee_1.getEstimatedFee)(feeRate, psbt.txInputs.length, 1);
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
function createP2MS(pks, m, network) {
    const p2ms = bitcoinjs_lib_1.payments.p2ms({
        m: m,
        pubkeys: pks.map(pk => Buffer.from(pk, 'hex')),
        network: network,
    });
    const p2sh = bitcoinjs_lib_1.payments.p2wsh({
        redeem: p2ms,
        network: network,
    });
    return {
        address: p2sh.address,
        redeemScript: p2ms.output,
        p2sh: p2sh,
    };
}
function depositP2SHTransaction(scripts, amount, changeAddress, inputUTXOs, network, feeRate, pubKeys, m) {
    if (amount <= 0 || feeRate <= 0) {
        throw new Error("Amount and fee rate must be bigger than 0");
    }
    const numOutputs = scripts.dataEmbedScript ? 3 : 2;
    const p2ms = createP2MS(pubKeys, m, network);
    const { selectedUTXOs, fee } = (0, fee_1.getDepositTxInputUTXOsAndFees)(inputUTXOs, amount, feeRate, numOutputs);
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    selectedUTXOs.forEach(input => {
        psbt.addInput({
            hash: input.txid,
            index: input.vout,
            witnessUtxo: {
                script: Buffer.from(input.scriptPubKey, 'hex'),
                value: input.value,
            },
            redeemScript: p2ms.redeemScript,
        });
    });
    psbt.addOutput({
        address: p2ms.address,
        value: amount,
    });
    if (scripts.dataEmbedScript) {
        psbt.addOutput({
            script: scripts.dataEmbedScript,
            value: 0,
        });
    }
    const inputsSum = (0, fee_1.inputValueSum)(selectedUTXOs);
    if ((inputsSum - (amount + fee)) > BTC_DUST_SAT) {
        psbt.addOutput({
            address: changeAddress,
            value: inputsSum - (amount + fee),
        });
    }
    return {
        psbt,
        fee,
    };
}
exports.depositP2SHTransaction = depositP2SHTransaction;
function sendP2SHTransaction(depositTransaction, sendAddress, minimumFee, network, outputIndex = 0, pubKeys, m) {
    if (minimumFee <= 0) {
        throw new Error("Minimum fee must be bigger than 0");
    }
    const p2ms = createP2MS(pubKeys, m, network);
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    psbt.addInput({
        hash: depositTransaction.getHash(),
        index: outputIndex,
        witnessUtxo: {
            value: depositTransaction.outs[0].value,
            script: depositTransaction.outs[0].script,
        },
        witnessScript: p2ms.redeemScript, // Adding witnessScript here
        // redeemScript: p2ms.redeemScript, // Make sure to NOT set scriptSig, it should be empty for witness inputs
    });
    psbt.addOutput({
        address: sendAddress,
        value: depositTransaction.outs[0].value - minimumFee,
    });
    return { psbt };
}
exports.sendP2SHTransaction = sendP2SHTransaction;
function depositP2PKHTransaction(scripts, amount, changeAddress, inputUTXOs, network, feeRate, keyPair) {
    // Check that amount and fee are bigger than 0
    if (amount <= 0 || feeRate <= 0) {
        throw new Error("Amount and fee rate must be bigger than 0");
    }
    // Calculate the number of outputs based on the presence of the data embed script
    // We have 2 outputs by default: deposit output and change output
    const numOutputs = scripts.dataEmbedScript ? 3 : 2;
    const { selectedUTXOs, fee } = (0, fee_1.getDepositTxInputUTXOsAndFees)(inputUTXOs, amount, feeRate, numOutputs);
    const { address } = bitcoinjs_lib_1.payments.p2pkh({ pubkey: keyPair.publicKey, network });
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    for (let i = 0; i < selectedUTXOs.length; ++i) {
        const input = selectedUTXOs[i];
        psbt.addInput({
            hash: input.txid,
            index: input.vout,
            nonWitnessUtxo: Buffer.from(input.rawTransaction, 'hex'),
            sequence: 0xfffffffd, // Enable locktime by setting the sequence value to (RBF-able)
        });
    }
    psbt.addOutput({
        address: address,
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
    const inputsSum = (0, fee_1.inputValueSum)(selectedUTXOs);
    // Check if the change amount is above the dust limit, and if so, add it as a change output
    // console.log(`${inputsSum} ${amount} ${fee}`);
    if ((inputsSum - (amount + fee)) > BTC_DUST_SAT) {
        psbt.addOutput({
            address: changeAddress,
            value: inputsSum - (amount + fee),
        });
    }
    return {
        psbt,
        fee,
    };
}
exports.depositP2PKHTransaction = depositP2PKHTransaction;
function sendP2PKHTransaction(depositTransaction, sendAddress, minimumFee, network, outputIndex = 0) {
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    if (!depositTransaction.outs[outputIndex]) {
        throw new Error("Invalid outputIndex: no such output in the transaction");
    }
    const output = depositTransaction.outs[outputIndex];
    psbt.addInput({
        hash: depositTransaction.getId(),
        index: outputIndex,
        nonWitnessUtxo: Buffer.from(depositTransaction.toHex(), 'hex'),
    });
    const inputAmount = output.value;
    const outputAmount = inputAmount - minimumFee;
    if (outputAmount <= 0) {
        throw new Error("Output amount must be greater than 0 after fees");
    }
    psbt.addOutput({
        address: sendAddress,
        value: outputAmount,
    });
    return { psbt };
}
exports.sendP2PKHTransaction = sendP2PKHTransaction;
