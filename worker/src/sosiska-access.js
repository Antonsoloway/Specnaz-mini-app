// Immutable owner identity, verified against the current CRM account @AnSoloway.
export const SOSISKA_OWNER_ID='1456874273';
export const isSosiskaOwner=principal=>String(principal?.telegramId??'')===SOSISKA_OWNER_ID;
const restrictedKey=key=>key!=='membershipEvents'&&/help|tournament|battle|chest|event/i.test(key);
// Remove structured metrics before transport, calculations or model input.
// Names/descriptions are data, never authorization rules or rewritten identities.
export function restrictSosiskaData(value,owner=false){
 if(owner)return value;
 if(Array.isArray(value))return value.filter(v=>!(v&&typeof v==='object'&&(restrictedKey(String(v.field??''))||/^(eventScore|eventStats)$/.test(v.kind??'')))).map(v=>restrictSosiskaData(v));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!restrictedKey(key)).map(([key,v])=>[key,restrictSosiskaData(v)]));
 return value;
}
