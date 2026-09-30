import * as ledger from '@midnight-ntwrk/ledger-v8';

try {
  // Let's pass a dummy string to see if it complains about format
  ledger.verifySignature("mn_addr_preview1rqdxnv7lgvex2cck38nwyffsv68cwud4nk7asc5p2w4krpjx882s7mqg3g", Buffer.from("hello"), "dummy_sig");
} catch(e) {
  console.log(e);
}
