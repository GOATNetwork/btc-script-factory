import {
    script
} from "bitcoinjs-lib";
import {Output} from "bitcoinjs-lib/src/transaction";

export function hasOpReturnOutput(output: Output) {
    if (!output) {
        return false;
    }
    const scriptASM = script.toASM(output.script);
    return scriptASM.startsWith('OP_RETURN');
}


export const minBtc = 0.00000001;
