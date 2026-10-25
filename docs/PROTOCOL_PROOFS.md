# Portable protocol proofs

Export a fulfilled draw once; a tournament recipient can reopen and check its exact outcome with `@qentra/core` alone. The same implementation serves SDK root, `@qentra/sdk/proof` and `@qentra/sdk/solana` verification exports. Wallet discovery, transaction submission and RPC remain SDK responsibilities.

```js
import { parseProofFile, exportProofFile, verifyProofFile } from '@qentra/core';
const record = await parseProofFile(savedJson);
const result = await verifyProofFile(record);
console.log(result.mapping.result);
const portableJson = await exportProofFile(record);
```

## Modules and boundaries

| Module | Input → result | Responsibility |
| --- | --- | --- |
| `records.ts` | Schema1 records and mapping configuration → validated records or deterministic results | Historical browser records, IndexedDB/Memory repositories, unchanged mapping algorithm |
| `protocol.ts` | Fulfilled schema4 record → successful recomputation or error | Shared protocol record types, input hash, reveal chain, request-bound output, application mapping |
| `proof.ts` | JSON or decoded object → detached verified record, exported JSON, or integrity result | Structural/address validation and snapshot before asynchronous checks |

`ProtocolRecord` includes pending/requested/expired transport states. Proof-file APIs accept only fulfilled records with all verification material. `verifyProtocolRecord(record)` is the lower-level typed recomputation API. `parseProofFile(text)` validates imported JSON before returning a detached record. `exportProofFile(record)` verifies before serializing. `verifyProofFile(unknown)` returns `OfflineProofVerification`, whose `scope` is `offline-content-integrity`. Saved verification/payment flags remain unchanged and do not bypass recomputation.

## Exact recomputation

1. Hash UTF-8 `JSON.stringify(record.input)` using SHA-256; compare `inputDigest`. Property order is part of the fixed input. Preserve it through export/import.
2. Hash the 32-byte provider reveal `numHashes` times, bounded to 1–256; compare `providerCommitment`.
3. Hash the concatenation of UTF-8 `qentra-solana-v1`, the 32 request-address bytes decoded by the Solana codec, user contribution, provider reveal and input digest.
4. Compare the resulting 32 bytes with `outputBytes`, then reproduce the exact `qentra-sha256-v1` mapping/configuration/result.

Uniform integers, shuffles, weighted choices and unique tournament winners retain the existing mapper and its limits. No new randomness algorithm or address derivation is introduced. Offline checks establish content integrity; use the SDK's source-bound `verify` and payment methods when chain/source/payment provenance is needed.

## Installed usage and failure paths

Build and pack the core source with Node22+, then install its development tarball into a separate directory. Run the packed `examples/verify-proof.mjs` with a saved proof JSON file. It imports only the installed core package and needs no wallet, endpoint or payment. `schemas/protocol-proof.schema.json` describes structural fields; runtime verification additionally recomputes hashes and mapping.

Malformed JSON, missing fields, invalid addresses/u64/hex, out-of-range commitment paths, changed fixed inputs, changed reveals, changed output or changed mapping reject with a field or mechanism error. The tests cover roundtrip for all four mapping kinds, tampered content, missing fields and mutation while export is pending. The installed consumer writes a proof, checks it in a fresh process with network APIs disabled, and verifies that SDK exports are the same shared functions.
