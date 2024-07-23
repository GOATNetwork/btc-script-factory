"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.internalPubkey = void 0;
// internalPubkey denotes an unspendable internal public key to be used for the taproot output
const key = "0264173d3a9fb10d58cb5553332f0fa2b971809d1a8626ca7cb6eebb66eb4cb9ec";
exports.internalPubkey = Buffer.from(key, "hex").subarray(1, 33); // Do a subarray(1, 33) to get the public coordinate
