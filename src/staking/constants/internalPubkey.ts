// internalPubkey denotes an unspendable internal public key to be used for the taproot output
const key =
  "0283a8066a87cb2fe9800171ac79e464977b938e0f22059b9f75a9fb2d19d0e683";
export const internalPubkey = Buffer.from(key, "hex").subarray(1, 33); // Do a subarray(1, 33) to get the public coordinate
