import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { buildLockingScript } from "./locking.script";
import { UTXO } from "../types/UTXO";
import { PsbtTransactionResult } from "../types/transaction";
export { buildLockingScript };
export declare function lockingTransaction(scripts: {
    lockingScript: Buffer;
}, amount: number, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number, publicKeyNoCoord?: Buffer, lockHeight?: number): PsbtTransactionResult;
export declare function withdrawalTimeLockTransaction(scripts: {
    lockingScript: Buffer;
}, lockingTransaction: Transaction, withdrawalAddress: string, feeRate: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
export declare function withdrawalUnbondingTransaction(scripts: {
    lockingScript: Buffer;
}, lockingTransaction: Transaction, withdrawalAddress: string, feeRate: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
