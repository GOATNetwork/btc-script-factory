import { BitcoinCoreWallet } from "walletprovider-ts/lib/providers/bitcoin_core_wallet";

export function buildBitcoinCoreWallet(walletName: string) {
    let network = "regtest";
    let username = "111111";
    let password = "111111";
    let host = "ec2-3-15-141-150.us-east-2.compute.amazonaws.com";
    let port = 18443; // default Bitcoin Core RPC port for regtest
    return new BitcoinCoreWallet(walletName, host, port, username, password, network);
}

export function buildDefaultBitcoinCoreWallet(name: string = "alice") {
    return buildBitcoinCoreWallet(name);
}
