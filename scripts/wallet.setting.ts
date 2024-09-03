import { BitcoinCoreWallet } from "walletprovider-ts/lib/providers/bitcoin_core_wallet";

import BIP32Factory from "bip32";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
const bip32 = BIP32Factory(ecc);
const bip39 = require("bip39")

export function buildBitcoinCoreWallet(walletName: string) {
    let network = "regtest";
    let username = "111111";
    let password = "111111";
    let host = "ec2-3-15-141-150.us-east-2.compute.amazonaws.com";
    host = "localhost"
    let port = 18443; // default Bitcoin Core RPC port for regtest
    return new BitcoinCoreWallet(walletName, host, port, username, password, network);
}

export function buildDefaultBitcoinCoreWallet() {
    return buildBitcoinCoreWallet("alice");
}


export const mnemonicArray = [
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton how",
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton are",
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton you",
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton hello"
];

export async function deriveKey(mnemonic: string, network: any) {
    // Verify the above (Below is no different than other HD wallets)

    // let mnemonic = "worth pottery emotion apology alone coast evil tortoise calm normal cotton exchange";
    const seed = await bip39.mnemonicToSeed(mnemonic);

    // const rootKey = bip32.fromSeed(rng(64), network);
    const rootKey = bip32.fromSeed(seed, network);
    // https://github.com/bitcoinjs/bip32/blob/master/test/index.js
    // const path = `m/86'/0'/0'/0/0`; // Path to first child of receiving wallet on first account
    const path = "m/84'/1'/0'/0/0";
    return rootKey.derivePath(path);
}
