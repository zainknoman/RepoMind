const DB_NAME='repomind-cache';
const STORE='indexes';
const VERSION=1;

function openDb(){
  if(typeof indexedDB==='undefined')return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,VERSION);
    req.onupgradeneeded=()=>req.result.createObjectStore(STORE);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function projectKey(project){
  const paths=(project?.files||[]).filter(f=>f.text).map(f=>f.path).sort();
  let hash=2166136261;
  for(const value of [project?.name||'',...paths])for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return (hash>>>0).toString(16);
}
export async function loadCachedIndex(project){
  const db=await openDb();if(!db)return null;
  return new Promise(resolve=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).get(projectKey(project));
    req.onsuccess=()=>resolve(req.result?.index||null);
    req.onerror=()=>resolve(null);
  });
}
export async function saveCachedIndex(project,index){
  const db=await openDb();if(!db)return false;
  const snapshot=JSON.parse(JSON.stringify(index,(key,value)=>key==='_fileHandles'?undefined:value));
  snapshot.cacheVersion=1;snapshot.cachedAt=new Date().toISOString();
  return new Promise(resolve=>{
    const req=db.transaction(STORE,'readwrite').objectStore(STORE).put({index:snapshot},projectKey(project));
    req.onsuccess=()=>resolve(true);req.onerror=()=>resolve(false);
  });
}
export async function clearCachedIndex(project){
  const db=await openDb();if(!db)return;
  db.transaction(STORE,'readwrite').objectStore(STORE).delete(projectKey(project));
}
