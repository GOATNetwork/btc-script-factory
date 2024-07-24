/// <reference types="node" />
import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { initBTCCurve } from "./utils/curve";
import { BridgeV1ScriptData } from "./utils/bridgeV1Script";
import { UTXO } from "./types/UTXO";
export { initBTCCurve, BridgeV1ScriptData };
export declare function depositTransaction(scripts: {
    depositScript: Buffer;
}, amount: number, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number, publicKeyNoCoord?: Buffer, lockHeight?: number): {
    psbt: Psbt;
    fee: number;
};
export declare function sendTransaction(scripts: {
    depositScript: Buffer;
}, depositTransaction: Transaction, sendAddress: string, minimumFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
