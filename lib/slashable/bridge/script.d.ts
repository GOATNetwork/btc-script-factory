/// <reference types="node" />
import { BridgeScripts } from "../../types/BridgeScripts";
export declare const PK_LENGTH = 32;
export declare const ETH_PK_LENGTH = 20;
export declare class BridgeScriptData {
    #private;
    constructor(userKey: Buffer, covenantKeys: Buffer[], covenantThreshold: number, transferTimeLock: number, magicBytes: Buffer, evmAddress: Buffer);
    validate(): boolean;
    buildTimelockScript(timelock: number): Buffer;
    buildTransferTimeLockScript(): Buffer;
    buildTransferScript(): Buffer;
    buildProvablyNoteScript(): Buffer;
    buildScripts(): BridgeScripts;
}
