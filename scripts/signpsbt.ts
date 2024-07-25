import * as bitcoin from "bitcoinjs-lib";

const signPsbtFromBase64 = async (psbtBase64: string, ecPairs: any[], shouldExtractTransaction: boolean) => {
    /*
        if (ecPairs.length == 0) {
            let walletPrv = await this.dumpPrivKey();
            ecPairs.push(walletPrv)
        }
     */
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64);
    for (let i = 0; i < psbt.inputCount; i++) {
        ecPairs.forEach((ecPair) => {
            psbt.signInput(i, ecPair);
        });
    }
    /*
        ecPairs.forEach(ecPair => {
          for (let i = 0; i < psbt.inputCount; i++) {
            if (!psbt.validateSignaturesOfInput(i, ecPair.publicKey)) {
              throw new Error(`Invalid signature for input ${i}`);
            }
          }
        });
     */
    if (shouldExtractTransaction) {
        psbt.finalizeAllInputs();
        const transaction = psbt.extractTransaction();
        return transaction.toHex();
    }
    else {
        return psbt.toBase64();
    }
}

export { signPsbtFromBase64 }
