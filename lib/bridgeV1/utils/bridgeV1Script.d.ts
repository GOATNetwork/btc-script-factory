export declare const PK_LENGTH = 32;
export declare const ETH_PK_LENGTH = 20;
export declare class BridgeV1ScriptData {
    private posPubkey;
    private delegatorKey;
    private transferTimeLock;
    private combineBytes;
    private evmAddress;
    constructor(posPubkey: Buffer, delegatorKey: Buffer, transferTimeLock: number, validatorIndex: number, nonce: number, evmAddress: Buffer);
    private validate;
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
    buildDepositScript(): Buffer;
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
    buildStakingScript(): Buffer;
}
