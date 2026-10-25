# Core module reference

## Request records and encoding

`RequestRecord` stores schema version, request identity, timestamps, adapter/source mode, byte input, input digest, lifecycle state, output and optional mapping. `hex(Uint8Array)` and `unhex(string)` use two hexadecimal characters per byte. `digest(string)` hashes UTF-8 text with SHA-256.

`validateRecord(unknown)` returns an isolated clone after checking identity, supported adapter/evidence statuses, parseable dates, byte limits, digest consistency and events. A produced record must contain the requested number of output bytes. A mapped record must reproduce its stored result with the supported mapping version. Use this async validator for imported JSON, not a TypeScript cast. The JSON schema describes structure; it cannot recompute a digest or mapping.

## Reproducible helpers

`mapOutput(outputHex, config)` accepts 16 to 4096 output bytes. Mapping version is `qentra-sha256-v1`. Domain text is JSON serialization of `{ version, config }`, followed by a newline, lowercase output, another newline and a decimal counter starting at zero. SHA-256 expansion yields a big-endian 32-bit sample. The sampler accepts only complete buckets, avoiding modulo bias.

- `uniformInt`: inclusive bounds within signed 32-bit integers, including the full range.
- `shuffle`: Fisher-Yates permutation of 1 to 1000 labels.
- `weightedPick`: integer weights from zero through 2^32; positive total at most 2^32. Zero weights cannot win.
- `pickUnique`: selection without replacement; labels must be distinct and count must fit the pool.

Labels are nonempty strings of at most 200 characters. Configuration order and serialized property order form part of the versioned domain. Preserve exported configuration for exact replay. SHA-256 expansion maps an existing seed; it does not create more entropy.

## Persistence contract

`Repository` defines async `put`, `get` and `list`. `MemoryRepository` clones at ingress and egress and sorts by descending creation timestamp. It is intended for ephemeral sessions and tests. `IndexedDBRepository` uses idb-keyval 6.2.2, database `qentra-requests-v1`, store `requests`, with runtime validation on writes and reads. Its `get` currently scans the list. Browser storage availability and quotas remain application concerns.

## Review and checks

The core trust boundary is untrusted imported JSON and application-supplied mapping configuration. Tests exercise malformed codec input, rejected sampling buckets, invalid mapping ranges/weights, result reproduction and object isolation. The validator checks record consistency, not an authenticated entropy-source certificate or a fully ordered event audit. Operational timestamps and event strings are not cryptographic evidence. Consult the source guide when interpreting records.

## Shared protocol-proof APIs

Schema4 record verification and proof-file APIs are exported alongside these unchanged schema1 interfaces. See [portable protocol proofs](PROTOCOL_PROOFS.md) for module ownership, exact hashing, saved-file usage and failure checks.
