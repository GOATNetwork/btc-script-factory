export interface UTXO {
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: string;
}
