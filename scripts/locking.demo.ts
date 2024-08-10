import { BIP32Interface } from "bip32";
import * as ecc from "tiny-secp256k1";
import { initEccLib, networks, Psbt, Transaction } from "bitcoinjs-lib";
import * as locking from "../src/slashable/locking";
import * as lockingScript from "../src/slashable/locking/script";
import { BitcoinCoreWallet } from "walletprovider-ts/lib/providers/bitcoin_core_wallet";
import { mnemonicArray, deriveKey, buildDefaultBitcoinCoreWallet } from "./wallet.setting"

import { signPsbtFromBase64 } from "./signpsbt";

const network = networks.regtest;

initEccLib(ecc);

const LOCKING_TIMELOCK = 20;
const UNBONDING_TIMELOCK = 10;

const lockingAmount = 5e7; // Satoshi
async function initAccount(numCovenants: number): Promise<BIP32Interface[]> {
    let accounts = new Array(numCovenants);
    // lockr, covenants...covenants+numConv
    for (let i = 0; i < accounts.length; i++) {
        accounts[i] = await deriveKey(mnemonicArray[i], network);
    }
    return accounts;
}

class LockingProtocol {
    covenants: any[]
    wallet: BitcoinCoreWallet
    lockingTx: Transaction
    unbondingTx: Transaction
    scripts: any

    constructor(covenants: any[]) {
        this.covenants = covenants;
        this.wallet = buildDefaultBitcoinCoreWallet(); // lockr
        this.lockingTx = new Transaction;
        this.unbondingTx = new Transaction;
        this.scripts = null;
    }

    async getLockrPk() {
        let lockrAddress = await this.wallet.getAddress();
        let pubKey = await this.wallet.getPublicKey(lockrAddress);
        console.log("lockr address", lockrAddress);
        console.log("lockr public key", pubKey);
        let lockrPk = Buffer.from(pubKey, "hex").subarray(1, 33);
        return lockrPk;
    }

    async lock() {
        let lockrPk = await this.getLockrPk();
        let lockrAddress = await this.wallet.getAddress();

        let covenantsPks = this.covenants.map((x: any) => {
            return Buffer.from(x.publicKey, "hex").subarray(1, 33);
        });
        // FIXME: n-of-n limited?
        let covenantThreshold = covenantsPks.length;
        let scriptData = new lockingScript.LockingScriptData(
            lockrPk,
            covenantsPks,
            covenantThreshold,
            LOCKING_TIMELOCK,
            UNBONDING_TIMELOCK,
            Buffer.from("676f6174", "hex") // goat
        );
        this.scripts = scriptData.buildScripts();
        let changeAddress = await this.wallet.getAddress();
        let inputUTXOs = await this.wallet.getUtxos(lockrAddress, lockingAmount + 5e7);
        console.log("Lockr utxos", inputUTXOs);
        let feeRate = 1000;
        let publicKeyNoCoord = lockrPk;

        let lockHeight = await this.wallet.getBTCTipHeight() + 10;

        let { psbt } = locking.lockingTransaction(this.scripts, lockingAmount, changeAddress, inputUTXOs, network, feeRate, publicKeyNoCoord, lockHeight);

        console.log("psbt base64:", psbt.toBase64())

        await this.wallet.walletPassphrase("btcstaker", 1000);
        const signedLockingPsbtHex = await this.wallet.signPsbt(psbt.toHex());
        console.log("walltet signPsbt", signedLockingPsbtHex);
        let signedLockingPsbt = Psbt.fromHex(signedLockingPsbtHex);
        console.log("signPsbtFromBase64");

        // let receipt = await this.wallet.pushTx(lockingTx);
        let txHex = signedLockingPsbt.extractTransaction().toHex();
        console.log("txHex: ", txHex);

        await this.mine(10, await this.wallet.getAddress());

        let receipt = await this.wallet.pushTx(txHex);
        console.log(`txid: ${receipt}`)
        this.lockingTx = Transaction.fromHex(txHex);
    }

    // Get the lockr signature from the unbonding transaction
    getLockrSignature = (unbondingTx: Transaction): string => {
        try {
            return unbondingTx.ins[0].witness[0].toString("hex");
        } catch (error) {
            throw new Error("Failed to get lockr signature");
        }
    };

    async unbonding() {
        await this.mine(5, await this.wallet.getAddress());
        console.log("Unbonding");
        let { fastestFee } = await this.wallet.getNetworkFees();
        console.log(`fastestFee ${fastestFee}`)
        let lockingOutputIndex = 0;

        // TODO https://github.com/babylonchain/simple-locking/blob/dev/src/utils/delegations/signUnbondingTx.ts#L46

        const unsignedUnbondingPsbt: { psbt: Psbt } = locking.unbondingTransaction(
            this.scripts,
            this.lockingTx,
            fastestFee || 1000, // transactionFee,
            network,
            lockingOutputIndex
        );
        console.log("signPsbt");

        let keyPairs = [
            await this.wallet.dumpPrivKey(),
            this.covenants[0],
            this.covenants[1],
            this.covenants[2]
        ];
        const signedLockingPsbtHex = await signPsbtFromBase64(unsignedUnbondingPsbt.psbt.toBase64(), keyPairs, true);

        // sign transaction by covenants
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedLockingPsbtHex);
        console.log(`txid: ${receipt}`)
        await this.mine(20, await this.wallet.getAddress());
        this.check_balance();

        this.unbondingTx = Transaction.fromHex(signedLockingPsbtHex);
    }

    async withdrawEarlyUnbounded() {
        await this.mine(5, await this.wallet.getAddress());
        console.log("WithdrawEarlyUnbonded");
        let withdrawalAddress = await this.wallet.getAddress();
        let { fastestFee } = await this.wallet.getNetworkFees();
        console.log(`fastestFee ${fastestFee}, withdrawalAddress ${withdrawalAddress}`)
        let lockingOutputIndex = 0;
        const unsignedWithdrawalPsbt: { psbt: Psbt, fee: number } = locking.withdrawEarlyUnbondedTransaction(
            this.scripts,
            this.unbondingTx,
            withdrawalAddress,
            network,
            fastestFee || 1000, // feeRate,
            lockingOutputIndex
        );
        console.log("signPsbt");

        let keyPairs = [
            await this.wallet.dumpPrivKey()
        ];

        const signedLockingPsbtHex = await signPsbtFromBase64(unsignedWithdrawalPsbt.psbt.toBase64(), keyPairs, true);

        console.log("pushTx", signedLockingPsbtHex);
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedLockingPsbtHex);
        console.log("txid: ", receipt);
        await this.mine(20, await this.wallet.getAddress());
        this.check_balance();
    }

    async withdrawTimelock() {
        await this.mine(20, await this.wallet.getAddress());
        console.log("WithdrawTimelock");
        let withdrawalAddress = await this.wallet.getAddress();
        let { fastestFee } = await this.wallet.getNetworkFees();
        console.log(`fastestFee ${fastestFee}, withdrawalAddress ${withdrawalAddress}`)
        let lockingOutputIndex = 0;
        const unsignedWithdrawalPsbt: { psbt: Psbt, fee: number } = locking.withdrawTimelockUnbondedTransaction(
            this.scripts,
            this.lockingTx,
            withdrawalAddress,
            network,
            fastestFee || 1000, // feeRate,
            lockingOutputIndex
        );
        console.log("signPsbt");

        let keyPairs = [await this.wallet.dumpPrivKey()];
        const signedLockingPsbtHex = await signPsbtFromBase64(unsignedWithdrawalPsbt.psbt.toBase64(), keyPairs, true);

        console.log("pushTx", signedLockingPsbtHex);
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedLockingPsbtHex);
        console.log("txid: ", receipt);
        await this.mine(20, await this.wallet.getAddress());
        this.check_balance();
    }

    /*
    async slashEarly() {
        await mine(5, await this.wallet.getAddress());
        console.log("SlashEarly");
        let { fastestFee } = await this.wallet.getNetworkFees();
        let lockingOutputIndex = 0;
        let slashingAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
        console.log(`fastestFee ${fastestFee}, withdrawalAddress ${slashingAddress}`)
        let slashingRate = 0.5;
        const slashEarlyUnbondedPsbt: { psbt: Psbt } = locking.slashEarlyUnbondedTransaction(
            this.scripts,
            this.lockingTx,
            slashingAddress,
            slashingRate,
            fastestFee || 1000, // feeRate,
            network,
            lockingOutputIndex,
        );
        console.log("signPsbt");

        let keyPairs = [
            //await this.wallet.dumpPrivKey(),
            this.covenants[0],
            this.covenants[1],
            this.covenants[2],
        ];
        const signedLockingPsbtHex = await this.wallet.signPsbtFromBase64(slashEarlyUnbondedPsbt.psbt.toBase64(), keyPairs, true);

        console.log("pushTx", signedLockingPsbtHex);
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedLockingPsbtHex);
        await mine(20, await this.wallet.getAddress());
        this.check_balance();
    }
     */

    async slash() {
        await this.mine(20, await this.wallet.getAddress());
        console.log("Slashing");
        let { fastestFee } = await this.wallet.getNetworkFees();
        let lockingOutputIndex = 0;
        let slashingAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
        console.log(`fastestFee ${fastestFee}, slashing address ${slashingAddress}`)
        let slashingRate = 0.5;
        const slashTimelockUnbondedPsbt: { psbt: Psbt } = locking.slashTimelockUnbondedTransaction(
            this.scripts,
            this.lockingTx,
            slashingAddress,
            slashingRate,
            fastestFee || 1000, // feeRate,
            network,
            lockingOutputIndex
        );
        console.log("init account, lockr", await this.wallet.getAddress());

        let keyPairs = [
            await this.wallet.dumpPrivKey(),
            this.covenants[0],
            this.covenants[1],
            this.covenants[2]
        ];
        console.log("signPsbt");
        const signedLockingPsbtHex = await signPsbtFromBase64(slashTimelockUnbondedPsbt.psbt.toBase64(), keyPairs, true);

        console.log("pushTx", signedLockingPsbtHex);
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedLockingPsbtHex);
        console.log("txid: ", receipt);
        await this.mine(20, await this.wallet.getAddress());
        this.check_balance();
    }


    /*
   async slashEarly() {
   await mine(5, await this.wallet.getAddress());
   console.log("SlashEarly");
   let { fastestFee } = await this.wallet.getNetworkFees();
   let lockingOutputIndex = 0;
   let slashingAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
   console.log(`fastestFee ${fastestFee}, withdrawalAddress ${slashingAddress}`)
   let slashingRate = 0.5;
   const slashEarlyUnbondedPsbt: { psbt: Psbt } = locking.slashEarlyUnbondedTransaction(
   this.scripts,
   this.lockingTx,
   slashingAddress,
   slashingRate,
   fastestFee || 1000, // feeRate,
   network,
   lockingOutputIndex,
   );
   console.log("signPsbt");

   let keyPairs = [
       //await this.wallet.dumpPrivKey(),
   this.covenants[0],
   this.covenants[1],
   this.covenants[2],
   ];
   const signedLockingPsbtHex = await this.wallet.signPsbtFromBase64(slashEarlyUnbondedPsbt.psbt.toBase64(), keyPairs, true);

   console.log("pushTx", signedLockingPsbtHex);
   this.check_balance();
   let receipt = await this.wallet.pushTx(signedLockingPsbtHex);
   await mine(20, await this.wallet.getAddress());
   this.check_balance();
   }
     */

    async continue() {
        console.log("Starting the locking continuation process.");
        await this.mine(20, await this.wallet.getAddress());
        console.log("Mining completed.");
        let lockrPk = await this.getLockrPk();
        let lockrAddress = await this.wallet.getAddress();

        console.log("Fetching inputs for transaction.");
        let publicKeyNoCoord = lockrPk;
        console.log(`Lockr Public Key No Coordinate: ${publicKeyNoCoord.toString("hex")}`);

        let inputUTXOs = await this.wallet.getUtxos(lockrAddress);
        // console.log(`Input UTXOs: ${JSON.stringify(inputUTXOs)}`);

        let lockHeight = await this.wallet.getBTCTipHeight() + 10;
        console.log(`Computed lock height: ${lockHeight}`);

        let changeAddress = await this.wallet.getAddress();
        console.log(`Change address: ${changeAddress}`);

        let { fastestFee } = await this.wallet.getNetworkFees();
        console.log(`Retrieved network fee: ${fastestFee || 1000}`);

        console.log("Preparing to build the PSBT.");
        const { psbt, fee } = locking.continueTimelockLockingTransaction(
            this.scripts,
            this.lockingTx,
            network,
            fastestFee || 1000, // feeRate,
            0,
            5e7, // Amount
            changeAddress,
            inputUTXOs,
            publicKeyNoCoord,
            lockHeight
        );
        console.log(`PSBT prepared with fee: ${fee}, input count: ${psbt.inputCount}`);

        console.log("Attempting to sign the PSBT.");
        let keyPairs = [await this.wallet.dumpPrivKey(lockrAddress)];
        console.log(`Using private key: ${keyPairs[0].toWIF()}`); // Show the private key in WIF format

        psbt.data.inputs.forEach((input, index) => {
            if (input.witnessUtxo) {
                console.log(`Input ${index} witnessUtxo:`, input.witnessUtxo);
            } else if (input.nonWitnessUtxo) {
                let tx = Transaction.fromBuffer(input.nonWitnessUtxo);
                console.log(`Input ${index} nonWitnessUtxo tx details:`, tx.toHex());
            } else {
                console.log(`Input ${index} has no UTXO details attached.`);
            }
        });

        psbt.signInput(0, keyPairs[0]);
        psbt.signInput(1, keyPairs[0]);
        psbt.finalizeAllInputs();
        const signedLockingPsbtHex = psbt.extractTransaction().toHex();
        console.log("PSBT signed and finalized.");

        console.log("Mining additional blocks before pushing transaction.");
        await this.mine(10, await this.wallet.getAddress());

        console.log("Pushing transaction to the network.");
        let receipt = await this.wallet.pushTx(signedLockingPsbtHex);
        console.log(`Transaction pushed, txid: ${receipt}`);

        this.lockingTx = Transaction.fromHex(signedLockingPsbtHex);
        console.log("Updated local locking transaction record.");
    }

    async continueUnbondingLocking() {
        console.log("Starting the locking continuation process.");
        await this.mine(20, await this.wallet.getAddress());
        console.log("Mining completed.");

        console.log("Fetching inputs for transaction.");
        let publicKeyNoCoord = await this.getLockrPk();
        let lockrAddress = await this.wallet.getAddress();
        console.log(`Lockr Public Key No Coordinate: ${publicKeyNoCoord.toString("hex")}`);

        let inputUTXOs = await this.wallet.getUtxos(lockrAddress);
        // console.log(`Input UTXOs: ${JSON.stringify(inputUTXOs)}`);

        let lockHeight = await this.wallet.getBTCTipHeight() + 10;
        console.log(`Computed lock height: ${lockHeight}`);

        let changeAddress = await this.wallet.getAddress();
        console.log(`Change address: ${changeAddress}`);

        let { fastestFee } = await this.wallet.getNetworkFees();
        console.log(`Retrieved network fee: ${fastestFee || 1000}`);

        console.log("Preparing to build the PSBT.");
        const { psbt, fee } = locking.continueUnbondingLockingTransaction(
            this.scripts,
            this.lockingTx,
            fastestFee || 1000, // feeRate,
            network,
            0,
            0, // Amount
            changeAddress,
            inputUTXOs,
            fastestFee || 1000,
            publicKeyNoCoord,
            lockHeight
        );
        console.log("fee: ", fee);

        console.log("signPsbt");

        psbt.data.inputs.forEach((input, index) => {
            if (input.witnessUtxo) {
                console.log(`Input ${index} witnessUtxo:`, input.witnessUtxo);
            } else if (input.nonWitnessUtxo) {
                let tx = Transaction.fromBuffer(input.nonWitnessUtxo);
                console.log(`Input ${index} nonWitnessUtxo tx details:`, tx.toHex());
            } else {
                console.log(`Input ${index} has no UTXO details attached.`);
            }
        });

        let keyPairs = [
            await this.wallet.dumpPrivKey(),
            this.covenants[0],
            this.covenants[1],
            this.covenants[2]
        ];
        /*
        keyPairs.forEach(ecPair => {
            psbt.signInput(0, ecPair);
        })

        for (let i = 1; i < psbt.inputCount; i++) {
            psbt.signInput(i, keyPairs[0]);
        }


        psbt.finalizeAllInputs();
        const signedLockingPsbtHex = psbt.extractTransaction().toHex();
        console.log("PSBT signed and finalized.");
        */

        const signedLockingPsbtHex = await signPsbtFromBase64(psbt.toBase64(), keyPairs, true);
        console.log("mutiSign done")
        console.log("Mining additional blocks before pushing transaction.");
        await this.mine(10, await this.wallet.getAddress());

        console.log("Pushing transaction to the network.");
        let receipt = await this.wallet.pushTx(signedLockingPsbtHex);
        console.log(`Transaction pushed, txid: ${receipt}`);

        this.lockingTx = Transaction.fromHex(signedLockingPsbtHex);
        console.log("Updated local locking transaction record.");
    }

    async check_balance() {
        console.log("Wallet balance: ", await this.wallet.getBalance());
        // console.log("Lockr balance: ", await this.wallet.getUtxos(await this.wallet.getAddress()));
    }

    async mine(bn: number, addr: string) {
        await this.wallet.mine(bn, addr);
        // console.log("Lockr balance: ", await this.wallet.getUtxos(await this.wallet.getAddress()));
    }

    async fuel() {
        // give Alice 2 unspent outputs
        let walletAddress = await this.wallet.getAddress();
        console.log(`wallet address ${walletAddress}`);
        let value = 1e8;
        let utxos = await this.wallet.getUtxos(walletAddress, value);

        let psbt = new Psbt({ network });
        for (let utxoIndex = 0; utxoIndex < utxos.length; utxoIndex++) {
            console.log("Utxo[0]: ", utxos[utxoIndex]);

            let prevTxData = await this.wallet.getTransaction(utxos[utxoIndex].txid);
            console.log("prevous tx data, value: ", prevTxData, utxos[utxoIndex].value);
            const version = 1;
            psbt.setVersion(version);
            psbt.addInput({
                hash: utxos[utxoIndex].txid,
                index: utxos[utxoIndex].vout,
                nonWitnessUtxo: Buffer.from(prevTxData, "hex")
            });
        }
    }
}

async function run() {
    let accounts = await initAccount(3);
    let lockingProtocol = new LockingProtocol(accounts);

    await lockingProtocol.check_balance();
    // send token to lockr
    // await lockingProtocol.fuel(await getAddress(lockingProtocol.covenants[0]));
    // await lockingProtocol.fuel(await getAddress(lockingProtocol.covenants[1]));
    // await lockingProtocol.fuel(await getAddress(lockingProtocol.covenants[2]));

    await lockingProtocol.check_balance();

    // withdraw timelock
    {
      await lockingProtocol.mine(LOCKING_TIMELOCK, await lockingProtocol.wallet.getAddress());
      await lockingProtocol.check_balance();
      await lockingProtocol.lock();
      await lockingProtocol.check_balance();
      await lockingProtocol.withdrawTimelock();
    }

    // slash timelock
    {
      await lockingProtocol.mine(LOCKING_TIMELOCK, await lockingProtocol.wallet.getAddress());
      await lockingProtocol.check_balance();
      await lockingProtocol.lock();
      await lockingProtocol.check_balance();
      await lockingProtocol.slash();
    }

    // // slash early, TBD
    // {
    //    await mine(LOCKING_TIMELOCK, await lockingProtocol.wallet.getAddress());
    //    await lockingProtocol.check_balance();
    //    await lockingProtocol.lock();
    //    await lockingProtocol.check_balance();
    //    await lockingProtocol.slashEarly();
    // }

    // withdraw early
    {
      await lockingProtocol.mine(LOCKING_TIMELOCK, await lockingProtocol.wallet.getAddress());
      await lockingProtocol.check_balance();
      await lockingProtocol.lock();
      await lockingProtocol.check_balance();
      // unbonding transcation
      await lockingProtocol.unbonding();
      await lockingProtocol.withdrawEarlyUnbounded();
    }
    //
    // // natively continue lock
    // {
    //   await lockingProtocol.mine(LOCKING_TIMELOCK, await lockingProtocol.wallet.getAddress());
    //   await lockingProtocol.check_balance();
    //   await lockingProtocol.lock();
    //   await lockingProtocol.check_balance();
    //   await lockingProtocol.unbonding();
    //   await lockingProtocol.lock();
    // }
    //
    // // continue Timelock Locking
    // {
    //   await lockingProtocol.mine(LOCKING_TIMELOCK, await lockingProtocol.wallet.getAddress());
    //   await lockingProtocol.check_balance();
    //   await lockingProtocol.lock();
    //   await lockingProtocol.check_balance();
    //   await lockingProtocol.continue();
    //   await lockingProtocol.check_balance();
    //   await lockingProtocol.withdrawTimelock()
    // }
    // continue Timelock Locking
    {
        await lockingProtocol.mine(LOCKING_TIMELOCK, await lockingProtocol.wallet.getAddress());
        await lockingProtocol.check_balance();
        await lockingProtocol.lock();
        await lockingProtocol.check_balance();
        await lockingProtocol.continueUnbondingLocking()
        await lockingProtocol.check_balance();
        await lockingProtocol.withdrawTimelock();
    }
}

run().then(() => {
    console.log("Done");
    process.exit()
});
