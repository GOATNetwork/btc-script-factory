/// <reference types="node" />
import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { initBTCCurve } from "../utils/curve";
import { buildLockingScript } from "./locking.script";
import { UTXO } from "../types/UTXO";
import { PsbtTransactionResult } from "../types/transaction";
export { initBTCCurve, buildLockingScript };
export declare function lockingTransaction(scripts: {
    lockingScript: Buffer;
}, amount: number, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number, lockHeight?: number): PsbtTransactionResult;
export declare function withdrawalTimeLockTransaction(scripts: {
    lockingScript: Buffer;
}, lockingTransaction: Transaction, withdrawalAddress: string, minimumFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
export declare function withdrawalUnbondingTransaction(scripts: {
    lockingScript: Buffer;
}, lockingTransaction: Transaction, withdrawalAddress: string, transactionFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
