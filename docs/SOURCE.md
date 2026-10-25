# Source and delivery boundaries

Qentra separates entropy origin, generation evidence, reproducible application mapping and onchain delivery. Core owns shared schema4 protocol-record recomputation and saved-proof parsing/export, plus the existing schema1 browser record and repositories.

Schema4 proof checks bind fixed inputs, request-address bytes, provider reveal/commitment, output and application mapping. Offline recomputation has scope `offline-content-integrity`; saved payment and verification status fields retain their original meaning. Use SDK source/payment verification for chain-bound provenance. Core creates no wallet, RPC client, transaction or payment.

Schema1 browser records identify `qentra-browser-v1` and `browser-cryptographic`. Their `verification: not-applicable` and `delivery: not-requested` fields remain unchanged. Their mappings reproduce recorded bytes without relabeling the entropy source.

Quantum-source evidence and operational provider/transaction execution are distinct integration boundaries. Keep credentials outside exported records and preserve the exact serialized input order for reproducibility.
