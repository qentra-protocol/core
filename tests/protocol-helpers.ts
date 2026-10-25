import { address, getAddressEncoder } from '@solana/kit';
export type { ProtocolInput, ProtocolRecord } from '../src/index.js';
export const SYSTEM_PROGRAM='11111111111111111111111111111111';

export const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export const bytes=(value:string)=>{if(!/^[0-9a-f]{64}$/i.test(value))throw Error('Expected 32-byte value');return Uint8Array.from(value.match(/../g)!,x=>parseInt(x,16));};
const join=(...parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;};
export async function hash(...parts:Uint8Array[]){return new Uint8Array(await crypto.subtle.digest('SHA-256',join(...parts) as BufferSource));}
export const pub=(value:string)=>new Uint8Array(getAddressEncoder().encode(address(value)));
