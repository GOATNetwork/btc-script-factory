/// <reference types="node" />
import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { buildDepositScript } from "./bridge.script";
import { UTXO } from "../types/UTXO";
export { buildDepositScript };
export declare function depositTransaction(scripts: {
    depositScript: Buffer;
}, amount: number, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number): {
    psbt: Psbt;
    fee: number;
};
export declare function sendTransaction(scripts: {
    depositScript: Buffer;
}, depositTransaction: Transaction, sendAddress: string, minimumFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
