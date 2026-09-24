let mermaidPromise=null;
const MERMAID_URL='https://cdn.jsdelivr.net/npm/mermaid@12.0.0/dist/mermaid.min.js';

function loadMermaid(){
  if(typeof window==='undefined')return Promise.reject(new Error('Mermaid rendering requires a browser.'));
  if(window.mermaid)return Promise.resolve(window.mermaid);
  if(mermaidPromise)return mermaidPromise;
  mermaidPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-repomind-mermaid]');
    if(existing){
      existing.addEventListener('load',()=>resolve(window.mermaid),{once:true});
      existing.addEventListener('error',()=>reject(new Error('Unable to load Mermaid.js.')),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=MERMAID_URL;script.async=true;script.dataset.repomindMermaid='true';
    script.onload=()=>window.mermaid?resolve(window.mermaid):reject(new Error('Mermaid.js loaded without a global renderer.'));
    script.onerror=()=>reject(new Error('Unable to load Mermaid.js from the configured CDN.'));
    document.head.appendChild(script);
  });
  return mermaidPromise;
}

export async function renderMermaid(source){
  if(!source?.trim())return {svg:'',bindFunctions:null};
  const mermaid=await loadMermaid();
  mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'default'});
  const id='repomind-mermaid-'+Math.random().toString(36).slice(2);
  return mermaid.render(id,source.trim());
}