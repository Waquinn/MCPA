/* Fake SDK only. Attempts below target synthetic domains and are blocked by CSP. */
(async()=>{
 const result={constructed:0,blocked:[]};window.isolationResult=result;
 const origin='https://blqlwfoserguserzmggo.supabase.co',key='sb_publishable_OFFLINE_SYNTHETIC_00000000';
 window.supabase={createClient(url,k){result.constructed++;return {supabaseUrl:url,supabaseKey:k,rest:{url:url+'/rest/v1'},auth:{url:url+'/auth/v1'},storage:{url:url+'/storage/v1'},functions:{url:url+'/functions/v1'},realtime:{endPoint:url.replace('https:','wss:')+'/realtime/v1'}};}};
 try{window.MCPAEnvironment.client();result.missingRejected=false;}catch{result.missingRejected=true;}
 window.MCPA_SUPABASE_CONFIG={url:'https://wrong-project.example',anonKey:key};
 try{window.MCPAEnvironment.client();result.wrongRejected=false;}catch{result.wrongRejected=true;}
 result.constructedBeforeValidation=result.constructed;
 window.MCPA_SUPABASE_CONFIG={url:origin,anonKey:key};window.MCPAEnvironment.client();
 document.addEventListener('securitypolicyviolation',e=>result.blocked.push({directive:e.effectiveDirective,url:e.blockedURI}));
 await fetch('https://wrong-project.example/forbidden').catch(()=>{});
 const image=document.createElement('img');image.src='https://wrong-project.example/photo.png';document.body.append(image);
 setTimeout(()=>{result.complete=true;},100);
})();
