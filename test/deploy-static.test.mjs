import test from 'node:test';
import assert from 'node:assert/strict';
import {deployStatic} from '../scripts/deploy-static.mjs';
test('fallback publishes only completed public assets and keeps both tokens out of the manifest',async()=>{
 const calls=[];
 const result=await deployStatic({token:'private-build-token',fetcher:async(url,init)=>{
  calls.push({url,init});assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer private-build-token');
  if(init.method==='POST'){
   const {manifest}=JSON.parse(init.body);
   assert.equal(Object.keys(manifest).length,8);
   for(const [path,v] of Object.entries(manifest)){assert.match(path,/^\/(index\.html|order\.html|order-config\.json|img\/[^/]+)$/);assert.match(v.hash,/^[a-f0-9]{32}$/);assert.ok(v.size>0);}
   assert.equal(init.body.includes('private-build-token'),false);
   return Response.json({success:true,result:{buckets:[],jwt:'private-completion-token'}});
  }
  const metadata=JSON.parse(await init.body.get('metadata').text());
  assert.equal(metadata.assets.jwt,'private-completion-token');assert.equal(metadata.compatibility_date,'2026-10-01');
  assert.equal('bindings' in metadata,false);
  return Response.json({success:true,result:{id:'sulaibiyarestaurant'}});
 }});
 assert.equal(result.files,8);assert.equal(calls.length,2);
});
test('missing assets, authorization errors and absent token never publish a version',async()=>{
 await assert.rejects(()=>deployStatic({token:''}),/token is missing/);
 for(const response of [{success:true,result:{buckets:[['missing']],jwt:'secret'}},{success:false,errors:[{code:10000}]}]){
  let count=0;
  await assert.rejects(()=>deployStatic({token:'test',fetcher:async()=>{count++;return Response.json(response,{status:response.success?200:403});}}));
  assert.equal(count,1);
 }
});
