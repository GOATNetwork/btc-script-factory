jest.setTimeout(60000);

import * as ecc from "tiny-secp256k1";
import { initEccLib, networks, Psbt, Transaction } from "bitcoinjs-lib";
import { buildDepositScript } from "../../src/covenantV1/utils/bridge.script";
import { depositTransaction } from "../../src/covenantV1";
import { buildDefaultBitcoinCoreWallet } from "./wallet.setting";

const network = networks.regtest;

initEccLib(ecc);

describe("depositTransaction", () => {
  const posKey = "d6ce14162f3954bac0fff55a12b6df7d614801f358b5d910fe7986a47102e657";
  const ownerEvmAddress = "0x2915fd8beebdc822887deceac3dfe1540fac9c81";

  const evmAddressBuffer = ownerEvmAddress.startsWith("0x") ?
    Buffer.from(ownerEvmAddress.slice(2), "hex") :
    Buffer.from(ownerEvmAddress, "hex");
  const posPubkeyBuffer = Buffer.from(posKey, "hex");

  const depositScript = buildDepositScript(evmAddressBuffer, posPubkeyBuffer);
  const wallet = buildDefaultBitcoinCoreWallet();

  it("should create a valid deposit transaction", async () => {
    await wallet.mine(10, await wallet.getAddress());
    console.log("Initial Balance:", await wallet.getBalance());

    const feeRate = 1000;
    const amount = 5e7; // Satoshi

    const changeAddress = await wallet.getAddress();
    const inputUTXOs = await wallet.getUtxos(changeAddress, amount);

    // build psbt
    const { psbt, fee } = depositTransaction(
      { depositScript },
      amount,
      changeAddress,
      inputUTXOs,
      network,
      feeRate
    );

    console.log("Transaction Fee:", fee);

    // sign psbt
    const signedDepositPsbtHex = await wallet.signPsbt(psbt.toHex());
    const signedDepositPsbt = Psbt.fromHex(signedDepositPsbtHex);

    const tx = signedDepositPsbt.extractTransaction();
    const txHex = tx.toHex();

    await wallet.mine(10, await wallet.getAddress());

    // push tx
    const receipt = await wallet.pushTx(txHex);

    console.log(`Transaction ID: ${receipt}`);

    const depositTx = Transaction.fromHex(txHex);
    expect(depositTx).toBeDefined();
    expect(depositTx.toHex()).toBe(txHex);
  });
});
