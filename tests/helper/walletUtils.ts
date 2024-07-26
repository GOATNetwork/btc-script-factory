// walletUtils.ts
import { Network, payments } from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";

const ECPair = ECPairFactory(ecc);

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
}

export class WalletUtils {
  network: Network;
  address?: string;
  utxos?: UTXO[];

  constructor(network: Network) {
    this.network = network;
  }

  public getAddress(): string {
    if (this.address) return this.address;
    this.address = this.generateAddress();
    return this.address;
  }

  public getUtxos(amount: number, count: number = 5): UTXO[] {
    this.utxos = this.generateUTXOs(this.getAddress(), amount, count);
    return this.utxos;
  }

  private generateAddress(): string {
    const keyPair = ECPair.makeRandom({ network: this.network });
    return payments.p2wpkh({ pubkey: keyPair.publicKey, network: this.network }).address!;
  }

  private generateUTXOs(address: string, amount: number, count: number): UTXO[] {
    const utxos: UTXO[] = [];
    for (let i = 0; i < count; i++) {
      utxos.push({
        txid: this.generateRandomTxId(),
        vout: i,
        value: Math.floor(amount / count),
        scriptPubKey: payments.p2wpkh({ address, network: this.network }).output!.toString("hex")
      });
    }
    return utxos;
  }

  private generateRandomTxId(): string {
    const buffer = Buffer.alloc(32);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer.toString("hex");
  }
}

export default WalletUtils;
