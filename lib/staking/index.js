"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.continueUnbondingStakingTransaction = exports.continueTimelockStakingTransaction = exports.createWitness = exports.unbondingTransaction = exports.slashEarlyUnbondedTransaction = exports.slashTimelockUnbondedTransaction = exports.withdrawTimelockUnbondedTransaction = exports.withdrawEarlyUnbondedTransaction = exports.stakingTransaction = exports.StakingScriptData = exports.initBTCCurve = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
const internalPubkey_1 = require("./constants/internalPubkey");
const curve_1 = require("./utils/curve");
Object.defineProperty(exports, "initBTCCurve", { enumerable: true, get: function () { return curve_1.initBTCCurve; } });
const stakingScript_1 = require("./utils/stakingScript");
Object.defineProperty(exports, "StakingScriptData", { enumerable: true, get: function () { return stakingScript_1.StakingScriptData; } });
const fee_1 = require("./utils/fee");
// https://bips.xyz/370
const BTC_LOCKTIME_HEIGHT_TIME_CUTOFF = 500000000;
const BTC_DUST_SAT = 546;
/**
 * Constructs an unsigned BTC Staking transaction in psbt format.
 *
 * Outputs:
 * - psbt:
 *   - The first output corresponds to the staking script with the specified amount.
 *   - The second output corresponds to the change from spending the amount and the transaction fee.
 *   - If a data embed script is provided, it will be added as the second output, and the fee will be the third output.
 * - fee: The total fee amount for the transaction.
 *
 * Inputs:
 * - scripts:
 *   - timelockScript, unbondingScript, slashingScript: Scripts for different transaction types.
 *   - dataEmbedScript: Optional data embed script.
 * - amount: Amount to stake.
 * - changeAddress: Address to send the change to.
 * - inputUTXOs: All available UTXOs from the wallet.
 * - network: Bitcoin network.
 * - feeRate: Fee rate in satoshis per byte.
 * - publicKeyNoCoord: Public key if the wallet is in taproot mode.
 * - lockHeight: Optional block height locktime to set for the transaction (i.e., not mined until the block height).
 *
 * @param {Object} scripts - Scripts used to construct the taproot output.
 * such as timelockScript, unbondingScript, slashingScript, and dataEmbedScript.
 * @param {number} amount - The amount to stake.
 * @param {string} changeAddress - The address to send the change to.
 * @param {UTXO[]} inputUTXOs - All available UTXOs from the wallet.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} feeRate - The fee rate in satoshis per byte.
 * @param {Buffer} [publicKeyNoCoord] - The public key if the wallet is in taproot mode.
 * @param {number} [lockHeight] - The optional block height locktime.
 * @returns {PsbtTransactionResult} The partially signed transaction and the fee.
 * @throws Will throw an error if the amount or fee rate is less than or equal
 * to 0, if the change address is invalid, or if the public key is invalid.
 */
function stakingTransaction(scripts, amount, changeAddress, inputUTXOs, network, feeRate, publicKeyNoCoord, lockHeight) {
    // Check that amount and fee are bigger than 0
    if (amount <= 0 || feeRate <= 0) {
        throw new Error("Amount and fee rate must be bigger than 0");
    }
    // Check whether the change address is a valid Bitcoin address.
    if (!bitcoinjs_lib_1.address.toOutputScript(changeAddress, network)) {
        throw new Error("Invalid change address");
    }
    // Check whether the public key is valid
    if (publicKeyNoCoord && publicKeyNoCoord.length !== stakingScript_1.PK_LENGTH) {
        throw new Error("Invalid public key");
    }
    // Calculate the number of outputs based on the presence of the data embed script
    // We have 2 outputs by default: staking output and change output
    const numOutputs = scripts.dataEmbedScript ? 3 : 2;
    const { selectedUTXOs, fee } = (0, fee_1.getStakingTxInputUTXOsAndFees)(inputUTXOs, amount, feeRate, numOutputs);
    console.log("selectedUTXOs", selectedUTXOs);
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
        {
            output: scripts.slashingScript,
        },
        [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
    ];
    // Create an pay-2-taproot (p2tr) output using the staking script
    const stakingOutput = bitcoinjs_lib_1.payments.p2tr({
        internalPubkey: internalPubkey_1.internalPubkey,
        scriptTree,
        network,
    });
    // Add the staking output to the transaction
    psbt.addOutput({
        address: stakingOutput.address,
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
    console.log(`${inputsSum} ${amount} ${fee}`);
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
exports.stakingTransaction = stakingTransaction;
/**
 * Constructs a withdrawal transaction for manually unbonded delegation.
 *
 * This transaction spends the unbonded output from the staking transaction.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 *   - slashingScript: Script for the slashing condition.
 * - tx: The original staking transaction.
 * - withdrawalAddress: The address to send the withdrawn funds to.
 * - network: The Bitcoin network.
 * - feeRate: The fee rate for the transaction in satoshis per byte.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * Returns:
 * - psbt: The partially signed transaction (PSBT).
 *
 * @param {Object} scripts - The scripts used in the transaction.
 * @param {Transaction} tx - The original staking transaction.
 * @param {string} withdrawalAddress - The address to send the withdrawn funds to.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @returns {PsbtTransactionResult} An object containing the partially signed transaction (PSBT).
 */
function withdrawEarlyUnbondedTransaction(scripts, tx, withdrawalAddress, network, feeRate, outputIndex = 0) {
    const scriptTree = [
        {
            output: scripts.slashingScript,
        },
        { output: scripts.unbondingTimelockScript },
    ];
    return withdrawalTransaction({
        timelockScript: scripts.unbondingTimelockScript,
    }, scriptTree, tx, withdrawalAddress, network, feeRate, outputIndex);
}
exports.withdrawEarlyUnbondedTransaction = withdrawEarlyUnbondedTransaction;
/**
 * Constructs a withdrawal transaction for naturally unbonded delegation.
 *
 * This transaction spends the unbonded output from the staking transaction when the timelock has expired.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - timelockScript: Script for the timelock condition.
 *   - slashingScript: Script for the slashing condition.
 *   - unbondingScript: Script for the unbonding condition.
 * - tx: The original staking transaction.
 * - withdrawalAddress: The address to send the withdrawn funds to.
 * - network: The Bitcoin network.
 * - feeRate: The fee rate for the transaction in satoshis per byte.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * Returns:
 * - psbt: The partially signed transaction (PSBT).
 *
 * @param {Object} scripts - The scripts used in the transaction.
 * @param {Transaction} tx - The original staking transaction.
 * @param {string} withdrawalAddress - The address to send the withdrawn funds to.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} feeRate - The fee rate for the transaction in satoshis per byte.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @returns {PsbtTransactionResult} An object containing the partially signed transaction (PSBT).
 */
function withdrawTimelockUnbondedTransaction(scripts, tx, withdrawalAddress, network, feeRate, outputIndex = 0) {
    const scriptTree = [
        {
            output: scripts.slashingScript,
        },
        [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
    ];
    return withdrawalTransaction(scripts, scriptTree, tx, withdrawalAddress, network, feeRate, outputIndex);
}
exports.withdrawTimelockUnbondedTransaction = withdrawTimelockUnbondedTransaction;
// withdrawalTransaction generates a transaction that
// spends the staking output of the staking transaction
function withdrawalTransaction(scripts, scriptTree, tx, withdrawalAddress, network, feeRate, outputIndex = 0) {
    // Check that withdrawal feeRate is bigger than 0
    if (feeRate <= 0) {
        throw new Error("Withdrawal feeRate must be bigger than 0");
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
    // withdraw tx always has 1 output only
    const estimatedFee = (0, fee_1.getEstimatedFee)(feeRate, psbt.txInputs.length, 1);
    console.log(`estimatedFee ${estimatedFee}, value`, tx.outs[outputIndex].value);
    psbt.addOutput({
        address: withdrawalAddress,
        value: tx.outs[outputIndex].value - estimatedFee,
    });
    return {
        psbt,
        fee: estimatedFee
    };
}
/**
 * Constructs a slashing transaction for a staking output without prior unbonding.
 *
 * This transaction spends the staking output of the staking transaction and distributes the funds
 * according to the specified slashing rate.
 *
 * Outputs:
 * - The first output sends `input * slashing_rate` funds to the slashing address.
 * - The second output sends `input * (1 - slashing_rate) - fee` funds back to the user's address.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - slashingScript: Script for the slashing condition.
 *   - timelockScript: Script for the timelock condition.
 *   - unbondingScript: Script for the unbonding condition.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 * - transaction: The original staking transaction.
 * - slashingAddress: The address to send the slashed funds to.
 * - slashingRate: The rate at which the funds are slashed (0 < slashingRate < 1).
 * - minimumFee: The minimum fee for the transaction in satoshis.
 * - network: The Bitcoin network.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * @param {Object} scripts - The scripts used in the transaction.
 * @param {Transaction} transaction - The original staking transaction.
 * @param {string} slashingAddress - The address to send the slashed funds to.
 * @param {number} slashingRate - The rate at which the funds are slashed.
 * @param {number} minimumFee - The minimum fee for the transaction in satoshis.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @returns {{ psbt: Psbt }} An object containing the partially signed transaction (PSBT).
 */
function slashTimelockUnbondedTransaction(scripts, stakingTransaction, slashingAddress, slashingRate, minimumFee, network, outputIndex = 0) {
    const slashingScriptTree = [
        {
            output: scripts.slashingScript,
        },
        [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
    ];
    return slashingTransaction({
        unbondingTimelockScript: scripts.unbondingTimelockScript,
        slashingScript: scripts.slashingScript,
    }, slashingScriptTree, stakingTransaction, slashingAddress, slashingRate, minimumFee, network, outputIndex);
}
exports.slashTimelockUnbondedTransaction = slashTimelockUnbondedTransaction;
/**
 * Constructs a slashing transaction for an early unbonded transaction.
 *
 * This transaction spends the staking output of the staking transaction and distributes the funds
 * according to the specified slashing rate.
 *
 * Outputs:
 * - The first output sends `input * slashing_rate` funds to the slashing address.
 * - The second output sends `input * (1 - slashing_rate) - fee` funds back to the user's address.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - slashingScript: Script for the slashing condition.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 * - transaction: The original staking transaction.
 * - slashingAddress: The address to send the slashed funds to.
 * - slashingRate: The rate at which the funds are slashed (0 < slashingRate < 1).
 * - minimumFee: The minimum fee for the transaction in satoshis.
 * - network: The Bitcoin network.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * Returns:
 * - psbt: The partially signed transaction (PSBT).
 *
 * @param {Object} scripts - The scripts used in the transaction. e.g slashingScript, unbondingTimelockScript
 * @param {Transaction} transaction - The original staking transaction.
 * @param {string} slashingAddress - The address to send the slashed funds to.
 * @param {number} slashingRate - The rate at which the funds are slashed.
 * @param {number} minimumFee - The minimum fee for the transaction in satoshis.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @returns {{ psbt: Psbt }} An object containing the partially signed transaction (PSBT).
 */
function slashEarlyUnbondedTransaction(scripts, stakingTransaction, slashingAddress, slashingRate, minimumFee, network, outputIndex = 0) {
    const unbondingScriptTree = [
        {
            output: scripts.slashingScript,
        },
        {
            output: scripts.unbondingTimelockScript
        },
    ];
    return slashingTransaction({
        unbondingTimelockScript: scripts.unbondingTimelockScript,
        slashingScript: scripts.slashingScript,
    }, unbondingScriptTree, stakingTransaction, slashingAddress, slashingRate, minimumFee, network, outputIndex);
}
exports.slashEarlyUnbondedTransaction = slashEarlyUnbondedTransaction;
/**
 * Constructs a slashing transaction for an on-demand unbonding.
 *
 * This transaction spends the staking output of the staking transaction and distributes the funds
 * according to the specified slashing rate.
 *
 * Outputs:
 * - The first output sends `input * slashing_rate` funds to the slashing address.
 * - The second output sends `input * (1 - slashing_rate) - fee` funds back to the user's address.
 *
 * Inputs:
 * - scripts: Scripts used to construct the taproot output.
 *   - slashingScript: Script for the slashing condition.
 *   - unbondingTimelockScript: Script for the unbonding timelock condition.
 * - transaction: The original staking transaction.
 * - slashingAddress: The address to send the slashed funds to.
 * - slashingRate: The rate at which the funds are slashed (0 < slashingRate < 1).
 * - minimumFee: The minimum fee for the transaction in satoshis.
 * - network: The Bitcoin network.
 * - outputIndex: The index of the output to be spent in the original transaction (default is 0).
 *
 * @param {Object} scripts - The scripts used in the transaction. e.g slashingScript, unbondingTimelockScript
 * @param {Transaction} transaction - The original staking transaction.
 * @param {string} slashingAddress - The address to send the slashed funds to.
 * @param {number} slashingRate - The rate at which the funds are slashed.
 * @param {number} minimumFee - The minimum fee for the transaction in satoshis.
 * @param {networks.Network} network - The Bitcoin network.
 * @param {number} [outputIndex=0] - The index of the output to be spent in the original transaction.
 * @returns {{ psbt: Psbt }} An object containing the partially signed transaction (PSBT).
 */
function slashingTransaction(scripts, scriptTree, transaction, slashingAddress, slashingRate, minimumFee, network, outputIndex = 0) {
    // Check that slashing rate and minimum fee are bigger than 0
    if (slashingRate <= 0 || minimumFee <= 0) {
        throw new Error("Slashing rate and minimum fee must be bigger than 0");
    }
    // Check that outputIndex is bigger or equal to 0
    if (outputIndex < 0) {
        throw new Error("Output index must be bigger or equal to 0");
    }
    const redeem = {
        output: scripts.slashingScript,
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
        hash: transaction.getHash(),
        index: outputIndex,
        tapInternalKey: internalPubkey_1.internalPubkey,
        witnessUtxo: {
            value: transaction.outs[0].value,
            script: transaction.outs[0].script,
        },
        tapLeafScript: [tapLeafScript],
    });
    const userValue = transaction.outs[0].value * (1 - slashingRate) - minimumFee;
    // We need to verify that this is above 0
    if (userValue <= 0) {
        // If it is not, then an error is thrown and the user has to stake more
        throw new Error("Not enough funds to slash, stake more");
    }
    // Add the slashing output
    psbt.addOutput({
        address: slashingAddress,
        value: transaction.outs[0].value * slashingRate,
    });
    // Change output contains unbonding timelock script
    const changeOutput = bitcoinjs_lib_1.payments.p2tr({
        internalPubkey: internalPubkey_1.internalPubkey,
        scriptTree: { output: scripts.unbondingTimelockScript },
        network,
    });
    // Add the change output
    psbt.addOutput({
        address: changeOutput.address,
        value: transaction.outs[0].value * (1 - slashingRate) - minimumFee,
    });
    return { psbt };
}
function unbondingTransaction(scripts, stakingTx, transactionFee, network, outputIndex = 0) {
    // Check that transaction fee is bigger than 0
    if (transactionFee <= 0) {
        throw new Error("Unbonding fee must be bigger than 0");
    }
    // Check that outputIndex is bigger or equal to 0
    if (outputIndex < 0) {
        throw new Error("Output index must be bigger or equal to 0");
    }
    // Build input tapleaf script
    const inputScriptTree = [
        {
            output: scripts.slashingScript,
        },
        [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
    ];
    const inputRedeem = {
        output: scripts.unbondingScript,
        redeemVersion: 192,
    };
    const p2tr = bitcoinjs_lib_1.payments.p2tr({
        internalPubkey: internalPubkey_1.internalPubkey,
        scriptTree: inputScriptTree,
        redeem: inputRedeem,
        network,
    });
    const inputTapLeafScript = {
        leafVersion: inputRedeem.redeemVersion,
        script: inputRedeem.output,
        controlBlock: p2tr.witness[p2tr.witness.length - 1],
    };
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    psbt.addInput({
        hash: stakingTx.getHash(),
        index: outputIndex,
        tapInternalKey: internalPubkey_1.internalPubkey,
        witnessUtxo: {
            value: stakingTx.outs[0].value,
            script: stakingTx.outs[0].script,
        },
        tapLeafScript: [inputTapLeafScript],
    });
    // Build output tapleaf script
    const outputScriptTree = [
        {
            output: scripts.slashingScript,
        },
        { output: scripts.unbondingTimelockScript },
    ];
    const unbondingOutput = bitcoinjs_lib_1.payments.p2tr({
        internalPubkey: internalPubkey_1.internalPubkey,
        scriptTree: outputScriptTree,
        network,
    });
    // Add the unbonding output
    psbt.addOutput({
        address: unbondingOutput.address,
        value: stakingTx.outs[0].value - transactionFee,
    });
    return {
        psbt
    };
}
exports.unbondingTransaction = unbondingTransaction;
// this function is used to create witness for unbonding transaction
const createWitness = (originalWitness, paramsCovenants, covenantSigs) => {
    // map API response to Buffer values
    const covenantSigsBuffers = covenantSigs.map((sig) => ({
        btc_pk_hex: Buffer.from(sig.btc_pk_hex, "hex"),
        sig_hex: Buffer.from(sig.sig_hex, "hex"),
    }));
    // we need covenant from params to be sorted in reverse order
    const paramsCovenantsSorted = [...paramsCovenants]
        .sort(Buffer.compare)
        .reverse();
    const composedCovenantSigs = paramsCovenantsSorted.map((covenant) => {
        // in case there's covenant with this btc_pk_hex we return the sig
        // otherwise we return empty Buffer
        const covenantSig = covenantSigsBuffers.find((sig) => sig.btc_pk_hex.compare(covenant) === 0);
        return covenantSig?.sig_hex || Buffer.alloc(0);
    });
    return [...composedCovenantSigs, ...originalWitness];
};
exports.createWitness = createWitness;
/**
 * Creates a PSBT transaction to continue timelock staking.
 *
 * @param {Object} scripts - Scripts for different stages of the transaction.
 * @param {Buffer} scripts.timelockScript - Script to lock the transaction by height.
 * @param {Buffer} scripts.slashingScript - Script for slashing.
 * @param {Buffer} scripts.unbondingScript - Script for unbonding.
 * @param {Buffer} [scripts.dataEmbedScript] - Optional script for embedding additional data.
 * @param {Transaction} tx - The original transaction to continue staking.
 * @param {networks.Network} network - The Bitcoin network to use (mainnet, testnet, etc.).
 * @param {number} feeRate - Fee rate in satoshis per byte.
 * @param {number} [outputIndex=0] - Index of the output to be spent.
 * @param {number} [additionalAmount=0] - Additional amount to be added to the output.
 * @param {string} changeAddress - Address for the change output.
 * @param {UTXO[]} inputUTXOs - Array of UTXOs to be used as inputs.
 * @param {Buffer} [publicKeyNoCoord] - Optional public key without coordinates.
 * @param {number} [lockHeight] - Optional lock height for the transaction.
 * @returns {PsbtTransactionResult} - The result containing the PSBT transaction and additional data.
 */
function continueTimelockStakingTransaction(scripts, tx, network, feeRate, outputIndex = 0, additionalAmount = 0, changeAddress, inputUTXOs, publicKeyNoCoord, lockHeight) {
    // Create script tree for Taproot
    const scriptTree = [
        {
            output: scripts.slashingScript,
        },
        [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
    ];
    // Basic validation checks
    if (feeRate <= 0) {
        throw new Error("Withdrawal feeRate must be bigger than 0");
    }
    if (outputIndex < 0) {
        throw new Error("Output index must be bigger or equal to 0");
    }
    // position of time in the timelock script
    const timePosition = 2;
    // Decompile and validate timelock script
    const decompiled = bitcoinjs_lib_1.script.decompile(scripts.timelockScript);
    if (!decompiled) {
        throw new Error("Timelock script is not valid");
    }
    // Extract timelock value from script
    let timelock = 0;
    if (typeof decompiled[timePosition] !== "number") {
        const timeBuffer = decompiled[timePosition];
        timelock = bitcoinjs_lib_1.script.number.decode(timeBuffer);
    }
    else {
        const wrap = decompiled[timePosition] % 16;
        timelock = wrap === 0 ? 16 : wrap;
    }
    const redeem = {
        output: scripts.timelockScript,
        redeemVersion: 192,
    };
    // Generate Taproot payment output
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
    // Set PSBT version to 2
    psbt.setVersion(2);
    // Add input with timelock sequence
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
    // Validate output value
    const outputValue = tx.outs[outputIndex].value;
    if (outputValue < BTC_DUST_SAT) {
        throw new Error("Output value is less than dust limit");
    }
    // Calculate estimated fee and check amounts
    const estimatedFee = (0, fee_1.getEstimatedFee)(feeRate, psbt.txInputs.length, 1);
    const amount = tx.outs[outputIndex].value - estimatedFee + additionalAmount;
    if (amount <= 0) {
        throw new Error("Amount and fee rate must be bigger than 0");
    }
    // Validate change address
    if (!bitcoinjs_lib_1.address.toOutputScript(changeAddress, network)) {
        throw new Error("Invalid change address");
    }
    // Validate public key if provided
    const PK_LENGTH = 33; // Example constant for public key length
    if (publicKeyNoCoord && publicKeyNoCoord.length !== PK_LENGTH) {
        throw new Error("Invalid public key");
    }
    // Determine number of outputs
    const numOutputs = scripts.dataEmbedScript ? 3 : 2;
    const { selectedUTXOs, fee } = (0, fee_1.getStakingTxInputUTXOsAndFees)(inputUTXOs, additionalAmount, feeRate, numOutputs);
    // Add UTXOs as inputs
    for (const input of selectedUTXOs) {
        psbt.addInput({
            hash: input.txid,
            index: input.vout,
            witnessUtxo: {
                script: Buffer.from(input.scriptPubKey, "hex"),
                value: input.value,
            },
            ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
            sequence: 0xfffffffd, // RBF sequence
        });
    }
    // Add staking output
    psbt.addOutput({
        address: p2tr.address,
        value: amount,
    });
    // Add data embed output if present
    if (scripts.dataEmbedScript) {
        psbt.addOutput({
            script: scripts.dataEmbedScript,
            value: 0,
        });
    }
    // Calculate change amount and add change output if necessary
    const inputsSum = (0, fee_1.inputValueSum)(selectedUTXOs);
    const changeAmount = inputsSum - (amount + fee);
    if (changeAmount > BTC_DUST_SAT) {
        psbt.addOutput({
            address: changeAddress,
            value: changeAmount,
        });
    }
    // Set locktime if provided
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
exports.continueTimelockStakingTransaction = continueTimelockStakingTransaction;
function continueUnbondingStakingTransaction(scripts, stakingTx, transactionFee, network, outputIndex = 0, additionalAmount = 0, changeAddress, inputUTXOs, feeRate, publicKeyNoCoord, lockHeight) {
    // Check that transaction fee is bigger than 0
    if (transactionFee <= 0) {
        throw new Error("Unbonding fee must be bigger than 0");
    }
    // Check that outputIndex is bigger or equal to 0
    if (outputIndex < 0) {
        throw new Error("Output index must be bigger or equal to 0");
    }
    // Build input tapleaf script
    const inputScriptTree = [
        {
            output: scripts.slashingScript,
        },
        [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
    ];
    const inputRedeem = {
        output: scripts.unbondingScript,
        redeemVersion: 192,
    };
    const p2tr = bitcoinjs_lib_1.payments.p2tr({
        internalPubkey: internalPubkey_1.internalPubkey,
        scriptTree: inputScriptTree,
        redeem: inputRedeem,
        network,
    });
    const inputTapLeafScript = {
        leafVersion: inputRedeem.redeemVersion,
        script: inputRedeem.output,
        controlBlock: p2tr.witness[p2tr.witness.length - 1],
    };
    const psbt = new bitcoinjs_lib_1.Psbt({ network });
    const originStakingOutput = {
        hash: stakingTx.getHash(),
        index: outputIndex,
        tapInternalKey: internalPubkey_1.internalPubkey,
        witnessUtxo: {
            value: stakingTx.outs[0].value,
            script: stakingTx.outs[0].script,
        },
        tapLeafScript: [inputTapLeafScript],
    };
    psbt.addInput(originStakingOutput);
    // Build output tapleaf script
    const outputScriptTree = [
        {
            output: scripts.slashingScript,
        },
        [{ output: scripts.unbondingScript }, { output: scripts.timelockScript }],
    ];
    const stakingOutput = bitcoinjs_lib_1.payments.p2tr({
        internalPubkey: internalPubkey_1.internalPubkey,
        scriptTree: outputScriptTree,
        network,
    });
    const amount = stakingTx.outs[0].value - transactionFee + additionalAmount;
    /*
  const numOutputs = scripts.dataEmbedScript ? 3 : 2;
  const { selectedUTXOs, fee } = getStakingTxInputUTXOsAndFees(
    inputUTXOs, additionalAmount, feeRate, numOutputs
  );

  // Add the UTXOs provided as inputs to the transaction
  for (let i = 0; i < selectedUTXOs.length; ++i) {
    const input = selectedUTXOs[i];
    console.log('selectedUTXOs: ', input)
    // psbt.addInput({
    //   hash: input.txid,
    //   index: input.vout,
    //   witnessUtxo: {
    //     script: Buffer.from(input.scriptPubKey, "hex"),
    //     value: input.value,
    //   },
    //   this is needed only if the wallet is in taproot mode
      // ...(publicKeyNoCoord && { tapInternalKey: publicKeyNoCoord }),
      // sequence: 0xfffffffd, // Enable locktime by setting the sequence value to (RBF-able)
    // });
  }
  */
    // Add the unbonding output
    psbt.addOutput({
        address: stakingOutput.address,
        value: amount, // amount
    });
    if (scripts.dataEmbedScript) {
        // Add the data embed output to the transaction
        psbt.addOutput({
            script: scripts.dataEmbedScript,
            value: 0,
        });
    }
    // Add a change output only if there's any amount leftover from the inputs
    // const inputsSum = inputValueSum(selectedUTXOs);
    // const inputsSum = stakingTx.outs[0].value;
    // Check if the change amount is above the dust limit, and if so, add it as a change output
    // console.log(`${inputsSum} ${additionalAmount} ${fee}`);
    // if ((inputsSum - (additionalAmount + fee)) > BTC_DUST_SAT) {
    //   psbt.addOutput({
    //     address: changeAddress,
    //     // value: inputsSum - (additionalAmount + fee),
    //     value: inputsSum - (additionalAmount),
    //   });
    // }
    if (lockHeight) {
        if (lockHeight >= BTC_LOCKTIME_HEIGHT_TIME_CUTOFF) {
            throw new Error("Invalid lock height");
        }
        psbt.setLocktime(lockHeight);
    }
    const fee = 0;
    return {
        psbt,
        fee
    };
}
exports.continueUnbondingStakingTransaction = continueUnbondingStakingTransaction;