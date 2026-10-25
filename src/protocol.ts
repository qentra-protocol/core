import { address, getAddressEncoder } from '@solana/kit';
import { mapOutput, type MappingConfig, type Mapping } from './records.js';
const enc=new TextEncoder();
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const bytes=(value:string)=>{if(!/^[0-9a-f]{64}$/i.test(value))throw Error('Expected 32-byte value');return Uint8Array.from(value.match(/../g)!,x=>parseInt(x,16));};
const join=(...parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;};
async function hash(...parts:Uint8Array[]){return new Uint8Array(await crypto.subtle.digest('SHA-256',join(...parts) as BufferSource));}
const pub=(value:string)=>new Uint8Array(getAddressEncoder().encode(address(value)));
export type ProtocolInput={bytes:32;mapping:MappingConfig;serviceQuote?:string};
export type ProtocolRecord={schemaVersion:4;id:string;network:string;contract:string;sequence:string;createdAt:string;
 input:ProtocolInput;inputDigest:string;state:'requested'|'fulfilled'|'expired';verification:'pending'|'verified';
 delivery:'not-requested'|'pending'|'delivered'|'failed';requester:string;feePaid:string;feeQuoted:string;paymentVerified:boolean;recipient:string;userContribution:string;
 providerCommitment:string;numHashes:number;providerContribution?:string|undefined;outputBytes?:string|undefined;
 mapping?:Mapping|undefined;commitmentTx?:string|undefined;requestTx?:string|undefined;revealTx?:string|undefined;deliveryTx?:string|undefined;
 storage?:'events'|'account';requestAddress:string;callbackProgram:string;callbackAccount:string};
export async function verifyProtocolRecord(r:ProtocolRecord){
 if(r.schemaVersion!==4||r.input.bytes!==32||r.state!=='fulfilled'||!r.providerContribution||!r.outputBytes)throw Error('Wait for a fulfilled Solana request');
 if(r.inputDigest!==hex(await hash(enc.encode(JSON.stringify(r.input)))))throw Error('Fixed inputs changed');
 if(!Number.isInteger(r.numHashes)||r.numHashes<1||r.numHashes>256)throw Error('Invalid commitment path');
 let root=bytes(r.providerContribution);for(let i=0;i<r.numHashes;i++)root=await hash(root);
 if(hex(root)!==r.providerCommitment)throw Error('Reveal does not match commitment');
 const output=await hash(enc.encode('qentra-solana-v1'),pub(r.requestAddress),bytes(r.userContribution),bytes(r.providerContribution),bytes(r.inputDigest));
 if(hex(output)!==r.outputBytes)throw Error('Output does not match request');
 if(JSON.stringify(await mapOutput(r.outputBytes,r.input.mapping))!==JSON.stringify(r.mapping))throw Error('Application result changed');
}

