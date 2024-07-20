import { Psbt } from "bitcoinjs-lib";
export interface PsbtTransactionResult {
    psbt: Psbt;
    fee: number;
}
