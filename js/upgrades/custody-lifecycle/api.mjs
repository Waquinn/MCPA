export const VERSION=2;
export const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
export function createCustodyApi(client){
  if(!client?.rpc||!client?.storage)throw new Error('Provide the signed-in Supabase client.');
  const operations=new Map();
  const rpc=async(name,args={})=>{
    const {data,error}=await client.rpc(name,args);
    if(error)throw Object.assign(new Error(error.message||'The request failed. Refresh and try again.'),{code:error.code});
    return data;
  };
  return {
    client,rpc,
    snapshot:()=>rpc('mcpa_b_snapshot'),
    lookup:(reference,intent)=>rpc('mcpa_b_lookup',{p_reference:reference,p_intent:intent}),
    async mutate(action,payload,scope='default'){
      const key=`${scope}:${action}:${canonical(payload)}`;
      if(!operations.has(key))operations.set(key,crypto.randomUUID());
      return rpc('mcpa_b_action',{p_action:action,p_payload:payload,p_operation_id:operations.get(key)});
    },
    dispose(){operations.clear();}
  };
}
export const unresolved=item=>['pending','missing','disputed'].includes(item.outcome);
export const availableForBatch=asset=>asset.individual&&asset.status==='IN_USE'&&!asset.movementLock;
