import { Network, networks } from "bitcoinjs-lib";
import { calculateSpendAmountAndFee, getSpendTxInputUTXOsAndFees } from "../src/utils/feeV1";
import { UTXO } from "../src/types/UTXO";
import { PsbtOutputExtended } from "../src/types/psbtOutputs";
import { buildDataEmbedScript } from "../src/covenantV1/bridge";
import utxos from "./helper/utxos.json";

describe("Fee Calculation Tests", () => {
  const network: Network = networks.testnet;

  const magicBytes = Buffer.from("47545430", "hex");
  const evmAddress = Buffer.from("2915fd8beebdc822887deceac3dfe1540fac9c81", "hex");
  const dataEmbedScript = buildDataEmbedScript(magicBytes, evmAddress);

  const psbtOutputs: PsbtOutputExtended[] = [
    {
      address: "tb1qysxt7h98c60z77wz0hpwkr793pfmptln88afef",
      value: 0
    },
    {
      script: dataEmbedScript,
      value: 0
    }
  ];

  for (let feeRate = 1; feeRate <= 1000; feeRate *= 5) {
    it(`should calculate consistent fee and spend amount for feeRate ${feeRate}`, () => {
      const availableUTXOs: UTXO[] = utxos;

      const { fee: fee1, spendAmount } = calculateSpendAmountAndFee(
        network,
        availableUTXOs,
        feeRate,
        psbtOutputs
      );

      const { fee: fee2 } = getSpendTxInputUTXOsAndFees(
        network,
        availableUTXOs,
        spendAmount,
        feeRate,
        psbtOutputs
      );

      expect(fee1).toBeGreaterThan(0);
      expect(fee2).toBeGreaterThan(0);
    //   expect(fee1 - fee2).toBeLessThan(306 * feeRate);
      expect(fee1).toBeGreaterThan(fee2);
    });
  }
});
