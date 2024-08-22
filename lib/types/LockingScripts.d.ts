/// <reference types="node" />
export interface LockingScripts {
    timelockScript: Buffer;
    unbondingScript: Buffer;
    slashingScript: Buffer;
    unbondingTimelockScript: Buffer;
    provablyNoteScript: Buffer;
}
