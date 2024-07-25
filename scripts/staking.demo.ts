import BIP32Factory from "bip32";
import * as ecc from "tiny-secp256k1";
import { initEccLib, networks, Psbt, Transaction } from "bitcoinjs-lib";
import * as staking from "../src/staking";
import * as stakingScript from "../src/staking/utils/stakingScript";
import { BitcoinCoreWallet } from "walletprovider-ts/lib/providers/bitcoin_core_wallet";
import { buildDefaultBitcoinCoreWallet } from "./wallet.setting"

const bip32 = BIP32Factory(ecc);
// import * as assert from 'assert';
const network = networks.regtest;

const bip39 = require("bip39")
// const rng = require("randombytes");

initEccLib(ecc);

const STAKING_TIMELOCK = 20;
const UNBONDING_TIMELOCK = 10;

const mnemonicArray = [
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton how",
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton are",
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton you",
    "worth pottery emotion apology alone coast evil tortoise calm normal cotton hello"
];

async function deriveKey(mnemonic: string) {
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

const lockingAmount = 5e7; // Satoshi
async function initAccount(numCovenants: number): Promise<any[]> {
    let accounts = new Array(numCovenants);
    // staker, covenants...covenants+numConv
    for (let i = 0; i < accounts.length; i++) {
        accounts[i] = await deriveKey(mnemonicArray[i]);
    }
    return accounts;
}

class StakingProtocol {
    covenants: any[]
    wallet: BitcoinCoreWallet
    stakingTx: Transaction
    unbondingTx: Transaction
    scripts: any

    constructor(covenants: any[]) {
        this.covenants = covenants;
        this.wallet = buildDefaultBitcoinCoreWallet(); // staker
        this.stakingTx = new Transaction;
        this.unbondingTx = new Transaction;
        this.scripts = null;
    }

    async getStakerPk() {
        let stakerAddress = await this.wallet.getAddress();
        let pubKey = await this.wallet.getPublicKey(stakerAddress);
        console.log("staker address", stakerAddress);
        console.log("staker public key", pubKey);
        let stakerPk = Buffer.from(pubKey, "hex").subarray(1, 33);
        return stakerPk;
    }

    async lock() {
        let stakerPk = await this.getStakerPk();
        let stakerAddress = await this.wallet.getAddress();

        let covenantsPks = this.covenants.map((x: any) => {
            return Buffer.from(x.publicKey, "hex").subarray(1, 33);
        });
        // FIXME: n-of-n limited?
        let covenantThreshold = covenantsPks.length;
        let scriptData = new stakingScript.StakingScriptData(
            stakerPk,
            covenantsPks,
            covenantThreshold,
            STAKING_TIMELOCK,
            UNBONDING_TIMELOCK,
            Buffer.from("676f6174", "hex") // goat
        );
        this.scripts = scriptData.buildScripts();
        let changeAddress = await this.wallet.getAddress();
        let inputUTXOs = await this.wallet.getUtxos(stakerAddress);
        // console.log("Staker utxos", inputUTXOs);
        let feeRate = 1000;
        let publicKeyNoCoord = stakerPk;

        let lockHeight = await this.wallet.getBTCTipHeight() + 10;

        let { psbt } = staking.stakingTransaction(this.scripts, lockingAmount, changeAddress, inputUTXOs, network, feeRate, publicKeyNoCoord, lockHeight);

        console.log("psbt base64:", psbt.toBase64())
        const signedStakingPsbtHex = await this.wallet.signPsbt(psbt.toHex());
        console.log("walltet signPsbt", signedStakingPsbtHex);
        let signedStakingPsbt = Psbt.fromHex(signedStakingPsbtHex);
        console.log("signPsbtFromBase64");

        // let receipt = await this.wallet.pushTx(stakingTx);
        let txHex = signedStakingPsbt.extractTransaction().toHex();
        console.log("txHex: ", txHex);

        await this.mine(10, await this.wallet.getAddress());

        let receipt = await this.wallet.pushTx(txHex);
        console.log(`txid: ${receipt}`)
        this.stakingTx = Transaction.fromHex(txHex);
    }

    // Get the staker signature from the unbonding transaction
    getStakerSignature = (unbondingTx: Transaction): string => {
        try {
            return unbondingTx.ins[0].witness[0].toString("hex");
        } catch (error) {
            throw new Error("Failed to get staker signature");
        }
    };

    async unbonding() {
        await this.mine(5, await this.wallet.getAddress());
        console.log("Unbonding");
        let { fastestFee } = await this.wallet.getNetworkFees();
        console.log(`fastestFee ${fastestFee}`)
        let stakingOutputIndex = 0;

        // TODO https://github.com/babylonchain/simple-staking/blob/dev/src/utils/delegations/signUnbondingTx.ts#L46

        const unsignedUnbondingPsbt: { psbt: Psbt } = staking.unbondingTransaction(
            this.scripts,
            this.stakingTx,
            fastestFee || 1000, // transactionFee,
            network,
            stakingOutputIndex
        );
        console.log("signPsbt");

        let keyPairs = [
            await this.wallet.dumpPrivKey(),
            this.covenants[0],
            this.covenants[1],
            this.covenants[2]
        ];
        const signedStakingPsbtHex = await this.wallet.signPsbtFromBase64(unsignedUnbondingPsbt.psbt.toBase64(), keyPairs, true);

        // sign transaction by covenants
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedStakingPsbtHex);
        console.log(`txid: ${receipt}`)
        await this.mine(20, await this.wallet.getAddress());
        this.check_balance();

        this.unbondingTx = Transaction.fromHex(signedStakingPsbtHex);
    }

    async withdrawEarlyUnbounded() {
        await this.mine(5, await this.wallet.getAddress());
        console.log("WithdrawEarlyUnbonded");
        let withdrawalAddress = await this.wallet.getAddress();
        let { fastestFee } = await this.wallet.getNetworkFees();
        console.log(`fastestFee ${fastestFee}, withdrawalAddress ${withdrawalAddress}`)
        let stakingOutputIndex = 0;
        const unsignedWithdrawalPsbt: { psbt: Psbt, fee: number } = staking.withdrawEarlyUnbondedTransaction(
            this.scripts,
            this.unbondingTx,
            withdrawalAddress,
            network,
            fastestFee || 1000, // feeRate,
            stakingOutputIndex
        );
        console.log("signPsbt");

        let keyPairs = [
            await this.wallet.dumpPrivKey()
        ];

        const signedStakingPsbtHex = await this.wallet.signPsbtFromBase64(unsignedWithdrawalPsbt.psbt.toBase64(), keyPairs, true);

        console.log("pushTx", signedStakingPsbtHex);
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedStakingPsbtHex);
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
        let stakingOutputIndex = 0;
        const unsignedWithdrawalPsbt: { psbt: Psbt, fee: number } = staking.withdrawTimelockUnbondedTransaction(
            this.scripts,
            this.stakingTx,
            withdrawalAddress,
            network,
            fastestFee || 1000, // feeRate,
            stakingOutputIndex
        );
        console.log("signPsbt");

        let keyPairs = [await this.wallet.dumpPrivKey()];
        const signedStakingPsbtHex = await this.wallet.signPsbtFromBase64(unsignedWithdrawalPsbt.psbt.toBase64(), keyPairs, true);

        console.log("pushTx", signedStakingPsbtHex);
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedStakingPsbtHex);
        console.log("txid: ", receipt);
        await this.mine(20, await this.wallet.getAddress());
        this.check_balance();
    }

    /*
    async slashEarly() {
        await mine(5, await this.wallet.getAddress());
        console.log("SlashEarly");
        let { fastestFee } = await this.wallet.getNetworkFees();
        let stakingOutputIndex = 0;
        let slashingAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
        console.log(`fastestFee ${fastestFee}, withdrawalAddress ${slashingAddress}`)
        let slashingRate = 0.5;
        const slashEarlyUnbondedPsbt: { psbt: Psbt } = staking.slashEarlyUnbondedTransaction(
            this.scripts,
            this.stakingTx,
            slashingAddress,
            slashingRate,
            fastestFee || 1000, // feeRate,
            network,
            stakingOutputIndex,
        );
        console.log("signPsbt");

        let keyPairs = [
            //await this.wallet.dumpPrivKey(),
            this.covenants[0],
            this.covenants[1],
            this.covenants[2],
        ];
        const signedStakingPsbtHex = await this.wallet.signPsbtFromBase64(slashEarlyUnbondedPsbt.psbt.toBase64(), keyPairs, true);

        console.log("pushTx", signedStakingPsbtHex);
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedStakingPsbtHex);
        await mine(20, await this.wallet.getAddress());
        this.check_balance();
    }
     */

    async slash() {
        await this.mine(20, await this.wallet.getAddress());
        console.log("Slashing");
        let { fastestFee } = await this.wallet.getNetworkFees();
        let stakingOutputIndex = 0;
        let slashingAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
        console.log(`fastestFee ${fastestFee}, slashing address ${slashingAddress}`)
        let slashingRate = 0.5;
        const slashTimelockUnbondedPsbt: { psbt: Psbt } = staking.slashTimelockUnbondedTransaction(
            this.scripts,
            this.stakingTx,
            slashingAddress,
            slashingRate,
            fastestFee || 1000, // feeRate,
            network,
            stakingOutputIndex
        );
        console.log("init account, staker", await this.wallet.getAddress());

        let keyPairs = [
            await this.wallet.dumpPrivKey(),
            this.covenants[0],
            this.covenants[1],
            this.covenants[2]
        ];
        console.log("signPsbt");
        const signedStakingPsbtHex = await this.wallet.signPsbtFromBase64(slashTimelockUnbondedPsbt.psbt.toBase64(), keyPairs, true);

        console.log("pushTx", signedStakingPsbtHex);
        this.check_balance();
        let receipt = await this.wallet.pushTx(signedStakingPsbtHex);
        console.log("txid: ", receipt);
        await this.mine(20, await this.wallet.getAddress());
        this.check_balance();
    }


    /*
   async slashEarly() {
   await mine(5, await this.wallet.getAddress());
   console.log("SlashEarly");
   let { fastestFee } = await this.wallet.getNetworkFees();
   let stakingOutputIndex = 0;
   let slashingAddress = "bcrt1q7gjfeaydr8edeupkw3encq8pksnalvnda5yakt";
   console.log(`fastestFee ${fastestFee}, withdrawalAddress ${slashingAddress}`)
   let slashingRate = 0.5;
   const slashEarlyUnbondedPsbt: { psbt: Psbt } = staking.slashEarlyUnbondedTransaction(
   this.scripts,
   this.stakingTx,
   slashingAddress,
   slashingRate,
   fastestFee || 1000, // feeRate,
   network,
   stakingOutputIndex,
   );
   console.log("signPsbt");

   let keyPairs = [
       //await this.wallet.dumpPrivKey(),
   this.covenants[0],
   this.covenants[1],
   this.covenants[2],
   ];
   const signedStakingPsbtHex = await this.wallet.signPsbtFromBase64(slashEarlyUnbondedPsbt.psbt.toBase64(), keyPairs, true);

   console.log("pushTx", signedStakingPsbtHex);
   this.check_balance();
   let receipt = await this.wallet.pushTx(signedStakingPsbtHex);
   await mine(20, await this.wallet.getAddress());
   this.check_balance();
   }
     */

    async continue() {
        console.log("Starting the staking continuation process.");
        await this.mine(20, await this.wallet.getAddress());
        console.log("Mining completed.");
        let stakerPk = await this.getStakerPk();
        let stakerAddress = await this.wallet.getAddress();

        console.log("Fetching inputs for transaction.");
        let publicKeyNoCoord = stakerPk;
        console.log(`Staker Public Key No Coordinate: ${publicKeyNoCoord.toString("hex")}`);

        let inputUTXOs = await this.wallet.getUtxos(stakerAddress);
        // console.log(`Input UTXOs: ${JSON.stringify(inputUTXOs)}`);

        let lockHeight = await this.wallet.getBTCTipHeight() + 10;
        console.log(`Computed lock height: ${lockHeight}`);

        let changeAddress = await this.wallet.getAddress();
        console.log(`Change address: ${changeAddress}`);

        let { fastestFee } = await this.wallet.getNetworkFees();
        console.log(`Retrieved network fee: ${fastestFee || 1000}`);

        console.log("Preparing to build the PSBT.");
        const { psbt, fee } = staking.continueTimelockStakingTransaction(
            this.scripts,
            this.stakingTx,
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
        let keyPairs = [await this.wallet.dumpPrivKey(stakerAddress)];
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
        const signedStakingPsbtHex = psbt.extractTransaction().toHex();
        console.log("PSBT signed and finalized.");

        console.log("Mining additional blocks before pushing transaction.");
        await this.mine(10, await this.wallet.getAddress());

        console.log("Pushing transaction to the network.");
        let receipt = await this.wallet.pushTx(signedStakingPsbtHex);
        console.log(`Transaction pushed, txid: ${receipt}`);

        this.stakingTx = Transaction.fromHex(signedStakingPsbtHex);
        console.log("Updated local staking transaction record.");
    }

    async continueUnbondingStaking() {
        console.log("Starting the staking continuation process.");
        await this.mine(20, await this.wallet.getAddress());
        console.log("Mining completed.");

        console.log("Fetching inputs for transaction.");
        let publicKeyNoCoord = await this.getStakerPk();
        let stakerAddress = await this.wallet.getAddress();
        console.log(`Staker Public Key No Coordinate: ${publicKeyNoCoord.toString("hex")}`);

        let inputUTXOs = await this.wallet.getUtxos(stakerAddress);
        // console.log(`Input UTXOs: ${JSON.stringify(inputUTXOs)}`);

        let lockHeight = await this.wallet.getBTCTipHeight() + 10;
        console.log(`Computed lock height: ${lockHeight}`);

        let changeAddress = await this.wallet.getAddress();
        console.log(`Change address: ${changeAddress}`);

        let { fastestFee } = await this.wallet.getNetworkFees();
        console.log(`Retrieved network fee: ${fastestFee || 1000}`);

        console.log("Preparing to build the PSBT.");
        const { psbt, fee } = staking.continueUnbondingStakingTransaction(
            this.scripts,
            this.stakingTx,
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
        const signedStakingPsbtHex = psbt.extractTransaction().toHex();
        console.log("PSBT signed and finalized.");
        */

        const signedStakingPsbtHex = await this.wallet.signPsbtFromBase64(psbt.toBase64(), keyPairs, true);
        console.log("mutiSign done")
        console.log("Mining additional blocks before pushing transaction.");
        await this.mine(10, await this.wallet.getAddress());

        console.log("Pushing transaction to the network.");
        let receipt = await this.wallet.pushTx(signedStakingPsbtHex);
        console.log(`Transaction pushed, txid: ${receipt}`);

        this.stakingTx = Transaction.fromHex(signedStakingPsbtHex);
        console.log("Updated local staking transaction record.");
    }

    async check_balance() {
        console.log("Wallet balance: ", await this.wallet.getBalance());
        // console.log("Staker balance: ", await this.wallet.getUtxos(await this.wallet.getAddress()));
    }

    async mine(bn: number, addr: string) {
        await this.wallet.mine(bn, addr);
        // console.log("Staker balance: ", await this.wallet.getUtxos(await this.wallet.getAddress()));
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
    let stakingProtocol = new StakingProtocol(accounts);

    await stakingProtocol.check_balance();
    // send token to staker
    /*
   await stakingProtocol.fuel(await getAddress(stakingProtocol.covenants[0]));
   await stakingProtocol.fuel(await getAddress(stakingProtocol.covenants[1]));
   await stakingProtocol.fuel(await getAddress(stakingProtocol.covenants[2]));
     */

    await stakingProtocol.check_balance();

    // withdraw timelock
    {
      await stakingProtocol.mine(STAKING_TIMELOCK, await stakingProtocol.wallet.getAddress());
      await stakingProtocol.check_balance();
      await stakingProtocol.lock();
      await stakingProtocol.check_balance();
      await stakingProtocol.withdrawTimelock();
    }

    // slash timelock
    {
      await stakingProtocol.mine(STAKING_TIMELOCK, await stakingProtocol.wallet.getAddress());
      await stakingProtocol.check_balance();
      await stakingProtocol.lock();
      await stakingProtocol.check_balance();
      await stakingProtocol.slash();
    }

    // // slash early, TBD
    // {
    //    await mine(STAKING_TIMELOCK, await stakingProtocol.wallet.getAddress());
    //    await stakingProtocol.check_balance();
    //    await stakingProtocol.lock();
    //    await stakingProtocol.check_balance();
    //    await stakingProtocol.slashEarly();
    // }

    // withdraw early
    {
      await stakingProtocol.mine(STAKING_TIMELOCK, await stakingProtocol.wallet.getAddress());
      await stakingProtocol.check_balance();
      await stakingProtocol.lock();
      await stakingProtocol.check_balance();
      // unbonding transcation
      await stakingProtocol.unbonding();
      await stakingProtocol.withdrawEarlyUnbounded();
    }
    //
    // // continue lock
    // {
    //   await stakingProtocol.mine(STAKING_TIMELOCK, await stakingProtocol.wallet.getAddress());
    //   await stakingProtocol.check_balance();
    //   await stakingProtocol.lock();
    //   await stakingProtocol.check_balance();
    //   await stakingProtocol.unbonding();
    //   await stakingProtocol.lock();
    // }
    //
    // // continue Timelock Staking
    // {
    //   await stakingProtocol.mine(STAKING_TIMELOCK, await stakingProtocol.wallet.getAddress());
    //   await stakingProtocol.check_balance();
    //   await stakingProtocol.lock();
    //   await stakingProtocol.check_balance();
    //   await stakingProtocol.continue();
    //   await stakingProtocol.check_balance();
    //   await stakingProtocol.withdrawTimelock()
    // }
    // continue Timelock Staking
    {
        await stakingProtocol.mine(STAKING_TIMELOCK, await stakingProtocol.wallet.getAddress());
        await stakingProtocol.check_balance();
        await stakingProtocol.lock();
        await stakingProtocol.check_balance();
        await stakingProtocol.continueUnbondingStaking()
        await stakingProtocol.check_balance();
        await stakingProtocol.withdrawTimelock();
    }
}

run().then(() => {
    console.log("Done");
    process.exit()
})
