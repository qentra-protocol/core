import { createStore, entries, set } from 'idb-keyval';

export type MappingConfig =
  | { kind: 'uniformInt'; min: number; max: number }
  | { kind: 'shuffle'; items: string[] }
  | { kind: 'weightedPick'; items: string[]; weights: number[] }
  | { kind: 'pickUnique'; items: string[]; count: number };
export type Mapping = { version: 'qentra-sha256-v1'; config: MappingConfig; result: number | string | string[] };
export type RequestRecord = {
  schemaVersion: 1; id: string; createdAt: string; updatedAt: string;
  adapterId: string; sourceMode: 'browser-cryptographic';
  input: { bytes: number }; inputDigest: string; outputBytes?: string;
  state: 'created' | 'generating' | 'produced' | 'failed'; error?: string;
  verification: 'not-applicable'; delivery: 'not-requested';
  mapping?: Mapping; events: { at: string; state: string }[];
};
export interface Repository { put(record: RequestRecord): Promise<void>; get(id: string): Promise<RequestRecord | undefined>; list(): Promise<RequestRecord[]> }
export const hex = (bytes: Uint8Array) => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
export function unhex(value: string): Uint8Array {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value)) throw new Error('Invalid hexadecimal output');
  return Uint8Array.from(value.match(/../g)!, x => parseInt(x, 16));
}
export async function digest(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
}
function checkedInteger(value: number, name: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
}
export async function rejectionSample(bound: number, next: () => Promise<number>) {
  checkedInteger(bound, 'Range size', 1, 4294967296);
  const limit = Math.floor(4294967296 / bound) * bound;
  for (let attempt = 0; attempt < 10000; attempt++) {
    const n = await next();
    checkedInteger(n, 'Sample', 0, 4294967295);
    if (n < limit) return n % bound;
  }
  throw new Error('Rejection sampler exhausted');
}
// Domain-separated SHA-256 expansion is deterministic mapping, not additional entropy.
export async function mapOutput(output: string, config: MappingConfig): Promise<Mapping> {
  const seed = unhex(output);
  if (seed.length < 16 || seed.length > 4096) throw new Error('Mapping requires 16–4096 output bytes');
  let counter = 0;
  const domain = JSON.stringify({ version: 'qentra-sha256-v1', config });
  async function draw(bound: number) {
    return rejectionSample(bound, async () => {
      const block = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${domain}\n${output.toLowerCase()}\n${counter++}`));
      return new DataView(block).getUint32(0, false);
    });
  }
  const items = 'items' in config ? config.items : undefined;
  if (items && (!Array.isArray(items) || items.length < 1 || items.length > 1000 || items.some(x => typeof x !== 'string' || !x.length || x.length > 200))) throw new Error('Provide 1–1000 non-empty labels');
  let result: Mapping['result'];
  switch (config.kind) {
    case 'uniformInt': {
      checkedInteger(config.min, 'Minimum', -2147483648, 2147483647);
      checkedInteger(config.max, 'Maximum', config.min, 2147483647);
      result = config.min + await draw(config.max - config.min + 1); break;
    }
    case 'shuffle': {
      const pool = [...config.items];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = await draw(i + 1); [pool[i], pool[j]] = [pool[j]!, pool[i]!];
      }
      result = pool; break;
    }
    case 'pickUnique': {
      checkedInteger(config.count, 'Selection count', 1, config.items.length);
      if (new Set(config.items).size !== config.items.length) throw new Error('Unique selections require distinct labels');
      const pool = [...config.items], picked: string[] = [];
      for (let i = 0; i < config.count; i++) picked.push(pool.splice(await draw(pool.length), 1)[0]!);
      result = picked; break;
    }
    case 'weightedPick': {
      if (!Array.isArray(config.weights) || config.weights.length !== config.items.length) throw new Error('Each label needs a weight');
      for (const weight of config.weights) checkedInteger(weight, 'Weight', 0, 4294967296);
      const total = config.weights.reduce((a, b) => a + b, 0);
      checkedInteger(total, 'Total weight', 1, 4294967296);
      let ticket = await draw(total), selected = '';
      for (let i = 0; i < config.items.length; i++) {
        if (ticket < config.weights[i]!) { selected = config.items[i]!; break; }
        ticket -= config.weights[i]!;
      }
      result = selected; break;
    }
    default: throw new Error('Unsupported mapping');
  }
  return { version: 'qentra-sha256-v1', config, result };
}
export async function validateRecord(value: unknown): Promise<RequestRecord> {
  if (!value || typeof value !== 'object') throw new Error('Expected a request record');
  const r = value as RequestRecord;
  if (r.schemaVersion !== 1 || typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(r.id)) throw new Error('Invalid request identity');
  if (r.adapterId !== 'qentra-browser-v1' || r.sourceMode !== 'browser-cryptographic' || r.verification !== 'not-applicable' || r.delivery !== 'not-requested') throw new Error('Unsupported source or evidence status');
  for (const date of [r.createdAt, r.updatedAt]) if (typeof date !== 'string' || !Number.isFinite(Date.parse(date))) throw new Error('Invalid timestamp');
  checkedInteger(r.input?.bytes, 'Byte count', 16, 4096);
  if (r.inputDigest !== await digest(JSON.stringify(r.input))) throw new Error('Input digest mismatch');
  if (!['created', 'generating', 'produced', 'failed'].includes(r.state) || !Array.isArray(r.events) || r.events.length < 1 || r.events.some(e => !e || !Number.isFinite(Date.parse(e.at)) || typeof e.state !== 'string')) throw new Error('Invalid lifecycle');
  if (r.state === 'produced' && (!r.outputBytes || unhex(r.outputBytes).length !== r.input.bytes)) throw new Error('Output length mismatch');
  if (r.mapping) {
    if (!r.outputBytes || r.mapping.version !== 'qentra-sha256-v1') throw new Error('Unsupported mapping version');
    const mapped = await mapOutput(r.outputBytes, r.mapping.config);
    if (JSON.stringify(mapped.result) !== JSON.stringify(r.mapping.result)) throw new Error('Mapping reproduction failed');
  }
  return structuredClone(r);
}
export class MemoryRepository implements Repository {
  private records = new Map<string, RequestRecord>();
  async put(record: RequestRecord) { this.records.set(record.id, structuredClone(record)); }
  async get(id: string) { const record = this.records.get(id); return record ? structuredClone(record) : undefined; }
  async list() { return [...this.records.values()].map(r => structuredClone(r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
}
export class IndexedDBRepository implements Repository {
  private store = createStore('qentra-requests-v1', 'requests');
  async put(record: RequestRecord) { await set(record.id, await validateRecord(record), this.store); }
  async get(id: string) { const records = await this.list(); return records.find(r => r.id === id); }
  async list() {
    const records: RequestRecord[] = [];
    for (const [, value] of await entries(this.store)) records.push(await validateRecord(value));
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
