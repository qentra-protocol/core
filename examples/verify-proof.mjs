import { readFile } from 'node:fs/promises';
import { parseProofFile, verifyProofFile } from '@qentra/core';

// node verify-proof.mjs draw-proof.json — no wallet or RPC client needed.
const path = process.argv[2];
if (!path) throw Error('Usage: node verify-proof.mjs draw-proof.json');
const record = await parseProofFile(await readFile(path, 'utf8'));
const result = await verifyProofFile(record);
console.log(JSON.stringify({ id: result.id, scope: result.scope, mapping: result.mapping }));
