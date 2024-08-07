/// <reference types="node" />
export interface StakingScripts {
    timelockScript: Buffer;
    unbondingScript: Buffer;
    slashingScript: Buffer;
    unbondingTimelockScript: Buffer;
    dataEmbedScript: Buffer;
}
