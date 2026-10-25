import assert from 'node:assert/strict';
import { digest, mapOutput, validateRecord, MemoryRepository, type RequestRecord } from '../src/index.ts';
// Fixed output is a reproducible example fixture, not a fresh entropy request.
const outputBytes = '0123456789abcdef'.repeat(4);
const at = new Date().toISOString();
const record: RequestRecord = {
  schemaVersion: 1, id: 'example-allocation', createdAt: at, updatedAt: at,
  adapterId: 'qentra-browser-v1', sourceMode: 'browser-cryptographic',
  input: { bytes: 32 }, inputDigest: await digest(JSON.stringify({ bytes: 32 })),
  outputBytes, state: 'produced', verification: 'not-applicable', delivery: 'not-requested',
  mapping: await mapOutput(outputBytes, { kind: 'pickUnique', items: ['Amber', 'Birch', 'Cedar'], count: 2 }),
  events: [{ at, state: 'produced' }],
};
const imported = await validateRecord(JSON.parse(JSON.stringify(record)));
const repository = new MemoryRepository(); await repository.put(imported);
assert.deepEqual((await repository.get(record.id))!.mapping, record.mapping);
console.log(JSON.stringify({ selection: imported.mapping!.result, reproduced: true }));
