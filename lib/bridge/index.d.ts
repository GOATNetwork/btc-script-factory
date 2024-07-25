import { Psbt, Transaction, networks } from "bitcoinjs-lib";
import { initBTCCurve } from "./utils/curve";
import { BridgeScriptData } from "./utils/bridgeScript";
import { PsbtTransactionResult } from "./types/transaction";
import { UTXO } from "./types/UTXO";
export { initBTCCurve, BridgeScriptData };
export declare function depositTransaction(scripts: {
    timelockScript: Buffer;
    transferScript: Buffer;
    dataEmbedScript?: Buffer;
}, amount: number, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number, publicKeyNoCoord?: Buffer, lockHeight?: number): PsbtTransactionResult;
export declare function sendTransaction(scripts: {
    timelockScript: Buffer;
    transferScript: Buffer;
    dataEmbedScript?: Buffer;
}, depositTransaction: Transaction, sendAddress: string, minimumFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
export declare function recaptureTransferTimelockTransaction(scripts: {
    timelockScript: Buffer;
    transferScript: Buffer;
    dataEmbedScript?: Buffer;
}, tx: Transaction, recaptureAddress: string, network: networks.Network, feeRate: number, outputIndex?: number): PsbtTransactionResult;
export declare function depositP2SHTransaction(scripts: {
    dataEmbedScript?: Buffer;
}, amount: number, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number, pubKeys: string[], m: number): {
    psbt: Psbt;
    fee: number;
};
export declare function sendP2SHTransaction(depositTransaction: Transaction, sendAddress: string, minimumFee: number, network: networks.Network, outputIndex: number | undefined, pubKeys: string[], m: number): {
    psbt: Psbt;
};
export declare function depositP2PKHTransaction(scripts: {
    dataEmbedScript?: Buffer;
}, amount: number, changeAddress: string, inputUTXOs: UTXO[], network: networks.Network, feeRate: number, keyPair: any): {
    psbt: Psbt;
    fee: number;
};
export declare function sendP2PKHTransaction(depositTransaction: Transaction, sendAddress: string, minimumFee: number, network: networks.Network, outputIndex?: number): {
    psbt: Psbt;
};
