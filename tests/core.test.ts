import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digest, hex, unhex, rejectionSample, mapOutput, validateRecord, MemoryRepository, type RequestRecord } from '../src/index.ts';
const seed = '0123456789abcdef'.repeat(4);
async function record(): Promise<RequestRecord> {
  const at = '2026-10-09T00:00:00.000Z';
  return { schemaVersion: 1, id: 'record-1', createdAt: at, updatedAt: at,
    adapterId: 'qentra-browser-v1', sourceMode: 'browser-cryptographic',
    input: { bytes: 32 }, inputDigest: await digest(JSON.stringify({ bytes: 32 })),
    outputBytes: seed, state: 'produced', verification: 'not-applicable',
    delivery: 'not-requested', events: [{ at, state: 'produced' }] };
}
test('hex codec preserves bytes and rejects incomplete or nonhex input', () => {
  assert.deepEqual(unhex(hex(new Uint8Array([0, 128, 255]))), new Uint8Array([0, 128, 255]));
  for (const bad of ['', '0', 'zz', 'aabb ']) assert.throws(() => unhex(bad));
});
test('sampler rejects the incomplete high-end bucket', async () => {
  const samples = [4294967295, 4294967294, 4];
  assert.equal(await rejectionSample(3, async () => samples.shift()!), 2);
  assert.equal(samples.length, 1);
  assert.equal(await rejectionSample(1, async () => 4294967295), 0);
  assert.equal(await rejectionSample(4294967296, async () => 4294967295), 4294967295);
  await assert.rejects(() => rejectionSample(0, async () => 0));
  await assert.rejects(() => rejectionSample(3, async () => -1));
  await assert.rejects(() => rejectionSample(3, async () => 4294967295), /exhausted/);
});
test('mapping replay is stable and full signed-int range is supported', async () => {
  const mapped = await mapOutput(seed, { kind: 'uniformInt', min: -2147483648, max: 2147483647 });
  assert.deepEqual(mapped, await mapOutput(seed.toUpperCase(), mapped.config));
  assert.ok(typeof mapped.result === 'number' && mapped.result >= -2147483648 && mapped.result <= 2147483647);
});
test('shuffle and selection preserve membership; zero-weight entries cannot win', async () => {
  const items = ['Amber', 'Birch', 'Cedar', 'Dune'];
  const original = [...items];
  const shuffled = await mapOutput(seed, { kind: 'shuffle', items });
  assert.deepEqual([...(shuffled.result as string[])].sort(), [...items].sort());
  assert.deepEqual(items, original);
  const picked = await mapOutput(seed, { kind: 'pickUnique', items, count: 3 });
  assert.equal(new Set(picked.result as string[]).size, 3);
  assert.ok((picked.result as string[]).every(x => items.includes(x)));
  assert.equal((await mapOutput(seed, { kind: 'weightedPick', items: ['zero', 'chosen'], weights: [0, 4] })).result, 'chosen');
});
test('invalid mapping requests fail rather than silently changing domains', async () => {
  await assert.rejects(() => mapOutput('00', { kind: 'uniformInt', min: 1, max: 6 }));
  await assert.rejects(() => mapOutput(seed, { kind: 'uniformInt', min: 8, max: 7 }));
  await assert.rejects(() => mapOutput(seed, { kind: 'pickUnique', items: ['x', 'x'], count: 1 }));
  await assert.rejects(() => mapOutput(seed, { kind: 'weightedPick', items: ['x'], weights: [0] }));
  await assert.rejects(() => mapOutput(seed, { kind: 'weightedPick', items: ['x'], weights: [1, 2] }));
  await assert.rejects(() => mapOutput(seed, { kind: 'weightedPick', items: ['x'], weights: [0.5] }));
});
test('record import reproduces mappings and rejects corrupted evidence fields', async () => {
  const r = await record(); r.mapping = await mapOutput(r.outputBytes!, { kind: 'uniformInt', min: 1, max: 6 });
  assert.deepEqual(await validateRecord(JSON.parse(JSON.stringify(r))), r);
  await assert.rejects(() => validateRecord({ ...r, inputDigest: '0'.repeat(64) }), /digest/);
  await assert.rejects(() => validateRecord({ ...r, outputBytes: '00' }), /length/);
  await assert.rejects(() => validateRecord({ ...r, mapping: { ...r.mapping, result: -1 } }), /reproduction/);
  await assert.rejects(() => validateRecord({ ...r, sourceMode: 'quantum' }), /source/);
  await assert.rejects(() => validateRecord({ ...r, events: [] }), /lifecycle/);
});
test('record validation snapshots caller data before asynchronous checks', async () => {
  const caller = await record();
  caller.mapping = await mapOutput(seed, { kind: 'shuffle', items: ['Amber', 'Birch', 'Cedar'] });
  const expected = structuredClone(caller);
  const pending = validateRecord(caller);
  assert.deepEqual(caller, expected);
  caller.id = 'invalid identity!';
  (caller as unknown as { sourceMode: string }).sourceMode = 'quantum';
  caller.input.bytes = 16;
  caller.events[0]!.state = 'caller-mutated';
  caller.mapping.config = { kind: 'shuffle', items: ['changed'] };
  (caller.mapping.result as string[])[0] = 'changed';
  const validated = await pending;
  assert.deepEqual(validated, expected);
  assert.deepEqual(await validateRecord(validated), expected);
  assert.equal(caller.id, 'invalid identity!');
  assert.equal(caller.sourceMode as string, 'quantum');
  caller.input.bytes = 4096;
  caller.events.length = 0;
  caller.mapping.config.items.push('later');
  (caller.mapping.result as string[]).push('later');
  assert.deepEqual(validated, expected);
});
test('memory repository isolates stored and retrieved objects', async () => {
  const repository = new MemoryRepository(); const r = await record();
  await repository.put(r); r.events.push({ at: r.updatedAt, state: 'changed' });
  const got = (await repository.get(r.id))!; assert.equal(got.events.length, 1);
  got.input.bytes = 100; assert.equal((await repository.get(r.id))!.input.bytes, 32);
  const list = await repository.list(); list[0]!.events.length = 0;
  assert.equal((await repository.get(r.id))!.events.length, 1);
});
