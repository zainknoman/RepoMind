import React, {useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const API='http://localhost:8000';

function App(){
 const [root,setRoot]=useState(''); const [project,setProject]=useState(null); const [selected,setSelected]=useState(null);
 const [query,setQuery]=useState(''); const [results,setResults]=useState([]); const [searching,setSearching]=useState(false); const [tab,setTab]=useState('overview');
 const [compiled,setCompiled]=useState(''); const [splitInput,setSplitInput]=useState(''); const [splitFiles,setSplitFiles]=useState([]); const [error,setError]=useState('');
 const files=project?.files||[];
 async function scan(){setError(''); try{const r=await fetch(API+'/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({root})}); const d=await r.json(); if(!r.ok) throw Error(d.detail||'Scan failed'); setProject(d)}catch(e){setError(e.message)}}
 async function openFile(path){setError(''); try{const r=await fetch(API+'/file?root='+encodeURIComponent(root)+'&path='+encodeURIComponent(path)); const d=await r.json(); if(!r.ok) throw Error(d.detail||'Read failed'); setSelected(d);setTab('viewer')}catch(e){setError(e.message)}}
 async function search(){setSearching(true);setError(''); try{const r=await fetch(API+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({root,query})}); const d=await r.json(); if(!r.ok) throw Error(d.detail||'Search failed');setResults(d.results||[])}catch(e){setError(e.message)}finally{setSearching(false)}}
 async function compile(){const chosen=files.filter(f=>f.text).slice(0,30); const payload=[]; for(const f of chosen){const r=await fetch(API+'/file?root='+encodeURIComponent(root)+'&path='+encodeURIComponent(f.path)); const d=await r.json();payload.push({name:f.path,content:d.content})}; const r=await fetch(API+'/compile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:payload})}); const d=await r.json();setCompiled(d.content);setTab('transform')}
 async function split(){const r=await fetch(API+'/split',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:splitInput})});const d=await r.json();setSplitFiles(d.files||[])}
 const ext=useMemo(()=>Object.entries(project?.statistics?.extensions||{}).sort((a,b)=>b[1]-a[1]).slice(0,8),[project]);
 return <div className="app">
  <header><div><div className="brand">Codebase Workbench</div><div className="tag">Analyze · Search · Inspect · Transform · Understand · Export</div></div><button onClick={scan}>Scan Project</button></header>
  <div className="toolbar"><input value={root} onChange={e=>setRoot(e.target.value)} placeholder="Absolute project path, e.g. D:\\Projects\\SchoolOS"/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()} placeholder="Search code..."/><button onClick={search} disabled={!root||!query}>{searching?'Searching…':'Search'}</button></div>
  {error&&<div className="error">{error}</div>}
  <nav>{[['overview','Overview'],['explorer','Explorer'],['search','Search'],['viewer','Viewer'],['transform','Transform']].map(([id,label])=><button className={tab===id?'active':''} onClick={()=>setTab(id)} key={id}>{label}</button>)}</nav>
  <main>
   {tab==='overview'&&<section><h1>{project?.project?.name||'Project Intelligence'}</h1><p className="muted">{project?.project?.root||'Scan a local repository to begin.'}</p><div className="cards"><Card n={project?.statistics?.files??'—'} t="Files"/><Card n={format(project?.statistics?.bytes)} t="Bytes"/><Card n={ext.length||'—'} t="File Types"/></div><h2>Top file types</h2><div className="list">{ext.map(([k,v])=><div className="row" key={k}><span>{k}</span><b>{v}</b></div>)}</div></section>}
   {tab==='explorer'&&<section><h1>Explorer</h1><div className="filelist">{files.map(f=><button key={f.path} onClick={()=>openFile(f.path)}>{f.path}<span>{format(f.size)}</span></button>)}</div></section>}
   {tab==='search'&&<section><h1>Search Results</h1><div className="results">{results.length?results.map((x,i)=><button key={i} onClick={()=>openFile(x.path)}><strong>{x.path}:{x.line}</strong><code>{x.text}</code></button>):<p className="muted">Run a search from the top bar.</p>}</div></section>}
   {tab==='viewer'&&<section><h1>{selected?.path||'Viewer'}</h1><pre className="code">{selected?.content||'Select a text file from Explorer or Search.'}</pre></section>}
   {tab==='transform'&&<section><h1>Transform</h1><div className="panel"><h2>Combine project files</h2><button onClick={compile} disabled={!project}>Compile first 30 text files</button><textarea value={compiled} onChange={e=>setCompiled(e.target.value)} placeholder="Compiled output appears here..."/></div><div className="panel"><h2>Reverse split</h2><textarea value={splitInput} onChange={e=>setSplitInput(e.target.value)} placeholder="Paste ReCodeX-style compiled content..."/><button onClick={split}>Split Files</button>{splitFiles.map(f=><div className="split" key={f.name}><b>{f.name}</b><pre>{f.content.slice(0,500)}</pre></div>)}</div></section>}
  </main>
 </div>
}
const Card=({n,t})=><div className="card"><strong>{n}</strong><span>{t}</span></div>;
const format=n=>typeof n==='number'?new Intl.NumberFormat().format(n):'—';
createRoot(document.getElementById('root')).render(<App/>);
