/* Validate before constructing a client or allowing a reused client to make requests. */
(function(){
  'use strict';
  const policy=window.MCPA_ENVIRONMENT_POLICY;
  if(!policy||!['staging','production'].includes(policy.environment)||!/^([a-z]{20})$/.test(policy.projectRef))throw Error('Invalid build environment policy.');
  const origin='https://'+policy.projectRef+'.supabase.co',guards=new WeakSet(),constructed=new WeakSet();
  function publicKey(key){
    if(typeof key!=='string'||!key||key!==key.trim()||key.startsWith('sb_secret_'))throw Error('A public Supabase key is required.');
    if(/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key))return key;
    try{
      const parts=key.split('.');if(parts.length!==3||parts.some(p=>!p))throw Error();
      const claim=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
      if(claim.role!=='anon'||claim.ref!==policy.projectRef)throw Error();
      if(claim.exp!==undefined&&(!Number.isFinite(claim.exp)||claim.exp*1000<=Date.now()))throw Error();
      return key;
    }catch{throw Error('Invalid, expired, wrong-project or privileged public configuration.');}
  }
  function configuration(config=window.MCPA_SUPABASE_CONFIG){
    if(!config?.url||!config?.anonKey)throw Error('Database connection is not configured.');
    // Exact spelling also rejects credentials, ports, paths, queries and fragments.
    if(config.url!==origin)throw Error('Database endpoint does not match the approved '+policy.environment+' project.');
    return Object.freeze({url:origin,anonKey:publicKey(config.anonKey)});
  }
  function destination(value,protocol='https:'){
    try{const u=new URL(String(value));if(u.protocol!==protocol||u.hostname!==policy.projectRef+'.supabase.co'||u.port||u.username||u.password)throw Error();return u;}
    catch{throw Error('Unverifiable or wrong-project Supabase client destination.');}
  }
  function verifyClient(client,config=configuration()){
    if(!client||!constructed.has(client)||client.supabaseUrl!==origin||client.supabaseKey!==config.anonKey)throw Error('Unverifiable or wrong-project Supabase client.');
    destination(client.supabaseUrl);
    for(const [part,path]of [['rest','/rest/v1'],['auth','/auth/v1'],['storage','/storage/v1'],['functions','/functions/v1']]){
      const u=destination(client[part]?.url);if(u.pathname.replace(/\/$/,'')!==path)throw Error('Unexpected Supabase service destination.');
    }
    const realtime=destination(client.realtime?.endPoint,'wss:');
    if(!['/realtime/v1','/realtime/v1/websocket'].includes(realtime.pathname))throw Error('Unexpected realtime destination.');
    return client;
  }
  function installSDK(){
    const sdk=window.supabase;
    if(!sdk?.createClient)throw Error('The database connection could not load.');
    if(guards.has(sdk.createClient))return;
    const original=sdk.createClient;
    const guarded=function(url,key,options){
      const config=configuration();
      if(url!==config.url||key!==config.anonKey)throw Error('Use the validated build configuration.');
      // Caller-supplied transports, storage, or redirect hooks cannot replace the reviewed SDK settings.
      if(options!==undefined)throw Error('Custom Supabase client options are not permitted in this artifact.');
      const instance=original.call(sdk,url,key);
      if(instance&&typeof instance==='object')constructed.add(instance);
      return verifyClient(instance,config);
    };
    guards.add(guarded);
    // Whitelist exports without retaining the SDK in a public prototype.
    // Frozen UMD exports remain supported; the original factory stays in this closure.
    const reviewed=Object.create(null);
    Object.defineProperty(reviewed,'createClient',{value:guarded,writable:false,configurable:false});
    if(sdk.SupabaseClient){const factory=function(url,key,options){return guarded(url,key,options);};Object.defineProperty(reviewed,'SupabaseClient',{value:factory,writable:false,configurable:false});}
    Object.freeze(reviewed);
    Object.defineProperty(window,'supabase',{value:reviewed,writable:false,configurable:false});
  }
  function client(){
    const config=configuration();installSDK();
    if(!window.supabaseClient)window.supabaseClient=window.supabase.createClient(config.url,config.anonKey);
    return verifyClient(window.supabaseClient,config);
  }
  Object.defineProperty(window,'MCPAEnvironment',{value:Object.freeze({configuration,verifyClient,installSDK,client}),writable:false,configurable:false});
})();
