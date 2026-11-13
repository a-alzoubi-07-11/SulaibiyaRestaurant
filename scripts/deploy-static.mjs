import {readFile,readdir} from 'node:fs/promises';
import {extname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hash} from 'blake3-wasm';

// Wrangler can upload assets successfully and then fail on its versions API.
// The assets-only upload API attaches exactly this manifest without a Worker.
export async function deployStatic({root=process.cwd(),token=process.env.CLOUDFLARE_API_TOKEN,fetcher=fetch}={}) {
 if(!token)throw Error('Cloudflare build token is missing');
 const manifest={};
 const files=['index.html','order.html','order-config.json',...(await readdir(resolve(root,'img'))).filter(n=>/^[A-Za-z0-9_.-]+\.(png|jpg|jpeg|webp|svg|ico)$/.test(n)).map(n=>'img/'+n)];
 for(const file of files){
  const data=await readFile(resolve(root,file));
  manifest['/'+file]={hash:hash(data.toString('base64')+extname(file).slice(1)).toString('hex').slice(0,32),size:data.byteLength};
 }
 const base='https://api.cloudflare.com/client/v4/accounts/64de312d16b1f4581a91be17d6150ee7/workers/scripts/sulaibiyarestaurant';
 async function call(path,method,body){
  const response=await fetcher(base+path,{method,headers:{Authorization:'Bearer '+token,...(typeof body==='string'?{'Content-Type':'application/json'}:{})},body,redirect:'error',signal:AbortSignal.timeout(30000)});
  const value=await response.json();
  if(!response.ok||!value.success)throw Error('Cloudflare static deployment failed: '+(value.errors??[]).map(e=>e.code).join(',')+' (HTTP '+response.status+')');
  return value.result;
 }
 const session=await call('/assets-upload-session','POST',JSON.stringify({manifest}));
 if(session.buckets?.length)throw Error('Assets are not fully uploaded; refusing to publish an incomplete site');
 if(!session.jwt)throw Error('Cloudflare did not confirm asset completion');
 const form=new FormData();
 form.append('metadata',new Blob([JSON.stringify({assets:{jwt:session.jwt,config:{}},compatibility_date:'2026-10-01'})],{type:'application/json'}));
 await call('','PUT',form);
 return {files:files.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const r=await deployStatic();console.log('Published verified static assets: '+r.files+' files');}
 catch(e){console.error(e.message);process.exitCode=1;}
}
