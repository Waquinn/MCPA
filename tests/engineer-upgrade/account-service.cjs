// Synthetic Auth transport only; invitation authorization runs in real local SQL.
exports.create=async function(fixture){
 const {createHandler}=await import('../../supabase/functions/manage-accounts/handler.mjs');
 const admin={
  auth:{getUser:async key=>({data:{user:fixture.actors[key]?{id:fixture.actors[key].authId}:null}}),admin:{
   generateLink:async({email,options})=>{
    const id=require('node:crypto').randomUUID();
    await fixture.db.query('insert into auth.users(id,email,invited_at,raw_user_meta_data) values($1,$2,now(),$3)',[id,email,options.data]);
    return {data:{user:{id},properties:{action_link:'https://fixture.invalid/verify?token=synthetic'}}};
   },updateUserById:async()=>({error:null})
  }},
  from:()=>({select:()=>({eq:(_,id)=>({maybeSingle:async()=>({data:(await fixture.db.query('select id,role,account_status from profiles where auth_user_id=$1',[id])).rows[0]})})})}),
  rpc:async(name,args)=>{
   try{return {data:(await fixture.db.query('select public.'+name+'('+Object.keys(args).map((_,i)=>'$'+(i+1)).join(',')+') value',Object.values(args))).rows[0].value};}
   catch(error){return {error:{code:error.code,message:error.message}};}
  }
 };
 return createHandler({admin,appUrl:'http://127.0.0.1/MCPA/index.html',invitationLinksEnabled:true});
};
