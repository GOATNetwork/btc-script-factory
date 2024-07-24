"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeV1ScriptData = exports.ETH_PK_LENGTH = exports.PK_LENGTH = void 0;
const bitcoinjs_lib_1 = require("bitcoinjs-lib");
exports.PK_LENGTH = 32;
exports.ETH_PK_LENGTH = 20;
class BridgeV1ScriptData {
    constructor(posPubkey, delegatorKey, transferTimeLock, validatorIndex, nonce, evmAddress) {
        if (!Buffer.isBuffer(delegatorKey) || !Buffer.isBuffer(evmAddress) || !Buffer.isBuffer(posPubkey) ||
            typeof transferTimeLock !== "number" ||
            typeof validatorIndex !== "number" || typeof nonce !== "number") {
            throw new Error("Invalid input types");
        }
        this.posPubkey = posPubkey;
        this.delegatorKey = delegatorKey;
        this.transferTimeLock = transferTimeLock;
        this.combineBytes = Buffer.concat([Buffer.alloc(4, validatorIndex), Buffer.alloc(4, nonce)]); // Ensure 4 bytes for each part
        this.evmAddress = evmAddress;
        if (!this.validate()) {
            throw new Error("Invalid script data provided");
        }
    }
    validate() {
        if (this.delegatorKey.length !== exports.PK_LENGTH || this.evmAddress.length !== exports.ETH_PK_LENGTH) {
            return false;
        }
        if (this.transferTimeLock > 65535) {
            return false;
        }
        if (this.combineBytes.length !== 8) { // Ensure combineBytes are exactly 8 bytes
            return false;
        }
        return true;
    }
    /**
     * Constructs a deposit script for validating transactions.
     *
     * This script is designed to verify deposits by checking the signature against the user's public key.
     *
     * Steps:
     * 1. <evmAddress>: Pushes the EVM address onto the stack but immediately removes it (OP_DROP), as it's not used in validation.
     * 2. <posPubkey>: Pushes the user's public key onto the stack.
     * 3. OP_CHECKSIG: Validates the signature of the transaction using the provided public key.
     *
     * @return {Buffer} - The compiled script buffer ready for use in blockchain transactions.
     * <evmAddress> OP_DROP <posPubkey> OP_CHECKSIG
     */
    buildDepositScript() {
        return bitcoinjs_lib_1.script.compile([
            this.evmAddress,
            bitcoinjs_lib_1.opcodes.OP_DROP,
            this.posPubkey,
            bitcoinjs_lib_1.opcodes.OP_CHECKSIG
        ]);
    }
    /**
     * Script to validate transactions for a specific owner under certain conditions.
     *
     * 1. Duplicates the top item on the stack (OP_DUP).
     * 2. Pushes the owner's EVM address onto the stack.
     * 3. Checks if the duplicated item equals the owner's EVM address (OP_EQUAL).
     * 4. If equal:
     *    a. Removes the top item from the stack (OP_DROP).
     *    b. Verifies that the block count meets a sequence condition (OP_CHECKSEQUENCEVERIFY) and then drops it (OP_DROP).
     *    c. Validates the signature with the delegator's public key (OP_CHECKSIG).
     * 5. If not equal:
     *    a. Compares the next item with either the validator index or a nonce (OP_EQUAL_VERIFY).
     *    b. Performs a 2-of-2 multisig check using the position public key and the delegator's public key (OP_CHECKMULTISIG).
     * 6. Ends the conditional execution (OP_ENDIF).
     *  @return {Buffer}
     *   OP_DUP <ownerEVMAddress> OP_EQUAL
     *   OP_IF
     *    OP_DROP <blockCount> OP_CHECKSEQUENCEVERIFY OP_DROP <DelegatorPubkey> OP_CHECKSIG
     *   OP_ELSE
     *    <validatorIndex || nonce> OP_EQUAL_VERIFY OP_2 <PosPubkey> <DelegatorPubkey> OP_2 OP_CHECKMULTISIG
     *   OP_ENDIF
     */
    buildStakingScript() {
        return bitcoinjs_lib_1.script.compile([
            bitcoinjs_lib_1.opcodes.OP_DUP,
            this.evmAddress,
            bitcoinjs_lib_1.opcodes.OP_EQUAL,
            bitcoinjs_lib_1.opcodes.OP_IF,
            bitcoinjs_lib_1.opcodes.OP_DROP,
            bitcoinjs_lib_1.script.number.encode(this.transferTimeLock),
            bitcoinjs_lib_1.opcodes.OP_CHECKSEQUENCEVERIFY,
            bitcoinjs_lib_1.opcodes.OP_DROP,
            this.delegatorKey,
            bitcoinjs_lib_1.opcodes.OP_CHECKSIG,
            bitcoinjs_lib_1.opcodes.OP_ELSE,
            this.combineBytes,
            bitcoinjs_lib_1.opcodes.OP_EQUALVERIFY,
            bitcoinjs_lib_1.opcodes.OP_2,
            this.posPubkey,
            this.delegatorKey,
            bitcoinjs_lib_1.opcodes.OP_2,
            bitcoinjs_lib_1.opcodes.OP_CHECKMULTISIG,
            bitcoinjs_lib_1.opcodes.OP_ENDIF
        ]);
    }
}
exports.BridgeV1ScriptData = BridgeV1ScriptData;
