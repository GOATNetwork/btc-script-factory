/// <reference types="node" />
import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { initBTCCurve } from "./utils/curve";
import { buildDepositScript } from "./utils/bridge.script";
import { UTXO } from "./types/UTXO";
import { PsbtTransactionResult } from "../staking/types/transaction";
export { initBTCCurve, buildDepositScript };
export declare function stakingTransaction(scripts: {
    stakingScript: Buffer;
}, amount: number, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number, lockHeight?: number): PsbtTransactionResult;
export declare function withdrawalTimeLockTransaction(scripts: {
    stakingScript: Buffer;
}, stakingTransaction: Transaction, withdrawalAddress: string, minimumFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
export declare function withdrawalUnbondingTransaction(scripts: {
    stakingScript: Buffer;
}, stakingTransaction: Transaction, withdrawalAddress: string, transactionFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
