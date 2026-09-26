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
async function projectKey(project){
  const files=(project?.files||[]).filter(f=>f.text).map(f=>f.path).sort();
  const metadata=[];
  for(const path of files){const file=project.files.find(f=>f.path===path);try{const raw=await file.handle.getFile();metadata.push(`${path}|${raw.size}|${raw.lastModified}`)}catch{metadata.push(`${path}|unreadable`)}}
  let hash=2166136261;
  for(const value of [project?.name||'',...metadata])for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return (hash>>>0).toString(16);
}

function serializeIndex(index){
  return JSON.parse(JSON.stringify(index,(key,value)=>{
    if(key==='_fileHandles')return undefined;
    if(key==='resolvedSymbols'&&Array.isArray(value)){
      return value.map(symbol=>symbol?.definitionKey||[symbol?.path,symbol?.name,symbol?.kind,symbol?.line].join('::')).filter(Boolean);
    }
    if((key==='references'||key==='importedBy')&&Array.isArray(value)){
      return value.map(item=>item?.definitionKey||item);
    }
    return value;
  }));
}

export async function loadCachedIndex(project){
  const db=await openDb();if(!db)return null;
  return new Promise(resolve=>{
    const req=db.transaction(STORE,'readonly').objectStore(STORE).get(await projectKey(project));
    req.onsuccess=()=>resolve(req.result?.index||null);
    req.onerror=()=>resolve(null);
  });
}

export async function saveCachedIndex(project,index){
  const db=await openDb();if(!db)return false;
  try{
    const snapshot=serializeIndex(index);
    snapshot.cacheVersion=2;snapshot.cachedAt=new Date().toISOString();
    return await new Promise(resolve=>{
      const req=db.transaction(STORE,'readwrite').objectStore(STORE).put({index:snapshot},await projectKey(project));
      req.onsuccess=()=>resolve(true);req.onerror=()=>resolve(false);
    });
  }catch{return false}
}

export async function clearCachedIndex(project){
  const db=await openDb();if(!db)return;
  projectKey(project).then(key=>db.transaction(STORE,'readwrite').objectStore(STORE).delete(key));
}