/// <reference types="node" />
export interface UTXO {
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
    rawTransaction?: string;
    redeemScript?: Buffer;
    witnessScript?: Buffer;
    sequence?: number;
}
