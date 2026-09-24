const readFile=async file=>file?.handle?(await file.handle.getFile()).text():'';
const routeRules=[
 {framework:'Express',pattern:/\b(?:app|router)\.(get|post|put|patch|delete|options|head|use)\s*\(\s*["']([^"']+)["']/g,method:m=>m[1].toUpperCase(),path:m=>m[2]},
 {framework:'NestJS',pattern:/@(Get|Post|Put|Patch|Delete|All)\s*\(\s*["']?([^"')]+)?["']?\s*\)/g,method:m=>m[1].toUpperCase(),path:m=>m[2]||'/'},
 {framework:'FastAPI',pattern:/@(?:app|router)\.(get|post|put|patch|delete|options)\s*\(\s*["']([^"']+)["']/g,method:m=>m[1].toUpperCase(),path:m=>m[2]},
 {framework:'Flask',pattern:/@(?:app|blueprint)\.route\s*\(\s*["']([^"']+)["']/g,method:()=> 'ROUTE',path:m=>m[1]},
 {framework:'Spring',pattern:/@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*(?:\(\s*["']([^"']+)["'])?/g,method:m=>m[1].replace('Mapping','').toUpperCase(),path:m=>m[2]||'/'},
 {framework:'ASP.NET',pattern:/\[(HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|Route)(?:\s*\(\s*["']([^"']+)["'])?/g,method:m=>m[1].replace('Http','').toUpperCase(),path:m=>m[2]||'/'}
];
const componentPatterns=[
 {framework:'React',pattern:/(?:export\s+)?(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_$]*)/g,kind:'component'},
 {framework:'Vue',pattern:/<template[\s>]/g,kind:'component'},
 {framework:'NestJS',pattern:/@Controller\s*\(\s*["']([^"']+)["']?\s*\)/g,kind:'controller'},
 {framework:'Spring',pattern:/@(RestController|Controller)\b/g,kind:'controller'},
 {framework:'ASP.NET',pattern:/\bclass\s+([A-Za-z0-9_]+)\s*:\s*(?:Controller|ControllerBase)/g,kind:'controller'},
 {framework:'FastAPI',pattern:/FastAPI\s*\(/g,kind:'application'},
 {framework:'Flask',pattern:/Flask\s*\(/g,kind:'application'}
];
const lineAt=(text,index)=>text.slice(0,index).split(/\r?\n/).length;
function hasFramework(index,name){
 const packages=(index?.project?.packages||[]).map(x=>String(x.name||x.package||'').toLowerCase());
 const frameworks=(index?.project?.frameworks||[]).map(x=>String(x.name).toLowerCase());
 const n=name.toLowerCase();
 return frameworks.includes(n)||packages.some(x=>x===n||x.includes(n));
}
async function routeAnalyzer(index){
 const findings=[];
 for(const file of index?.files||[]){const source=index._fileHandles?.get(file.path);if(!source)continue;const content=await readFile(source);
  for(const rule of routeRules){rule.pattern.lastIndex=0;let m;while((m=rule.pattern.exec(content)))findings.push({type:'route',framework:rule.framework,method:rule.method(m),path:rule.path(m),file:file.path,line:lineAt(content,m.index)})}}
 return findings.filter((x,i,a)=>a.findIndex(y=>y.framework===x.framework&&y.file===x.file&&y.line===x.line&&y.path===x.path)===i);
}
async function frameworkAnalyzer(index){
 const findings=[];
 for(const file of index?.files||[]){const source=index._fileHandles?.get(file.path);if(!source)continue;const content=await readFile(source);
  for(const rule of componentPatterns){if(!hasFramework(index,rule.framework)&&!((rule.framework==='React'&&/\.(jsx?|tsx?)$/.test(file.ext))||(rule.framework==='Vue'&&file.ext==='.vue')))continue;rule.pattern.lastIndex=0;let m;
   while((m=rule.pattern.exec(content)))findings.push({type:rule.kind,framework:rule.framework,name:m[1]||file.path.split('/').pop(),file:file.path,line:lineAt(content,m.index),evidence:content.slice(m.index,m.index+120).split(/\r?\n/)[0].trim()})}}
 return findings.filter((x,i,a)=>a.findIndex(y=>y.framework===x.framework&&y.file===x.file&&y.line===x.line&&y.type===x.type)===i);
}
function symbolResolutionAnalyzer(index){
 return (index?.references||[]).map(r=>{const count=r.resolvedSymbols?.length||0;return{name:r.name,file:r.from,line:r.line,column:r.column,status:count===1?'resolved':count>1?'ambiguous':'unresolved',targets:(r.resolvedSymbols||[]).map(s=>s.path+'::'+s.name).join(', ')}});
}
function architectureAnalyzer(index){
 const outgoing=new Map(),incoming=new Map();
 for(const e of index?.dependencies||[]){outgoing.set(e.from,(outgoing.get(e.from)||0)+1);incoming.set(e.to,(incoming.get(e.to)||0)+1)}
 return(index?.files||[]).map(f=>({file:f.path,outgoing:outgoing.get(f.path)||0,incoming:incoming.get(f.path)||0,score:(outgoing.get(f.path)||0)+(incoming.get(f.path)||0)})).sort((a,b)=>b.score-a.score);
}
export const ANALYZERS=[
 {id:'routes',name:'Route Discovery',category:'Framework',description:'Discovers common HTTP route/controller declarations.',run:routeAnalyzer},
 {id:'framework-structure',name:'Framework Structure',category:'Framework',description:'Finds framework components, controllers and application entry points.',run:frameworkAnalyzer},
 {id:'symbol-resolution',name:'Symbol Resolution',category:'Code Intelligence',description:'Reports resolved, ambiguous and unresolved indexed references.',run:symbolResolutionAnalyzer},
 {id:'architecture-hotspots',name:'Architecture Hotspots',category:'Architecture',description:'Ranks files by internal dependency fan-in and fan-out.',run:architectureAnalyzer}
];
export const getAnalyzers=()=>ANALYZERS.map(({run,...meta})=>meta);
export async function runAnalyzer(index,id){const analyzer=ANALYZERS.find(x=>x.id===id);if(!analyzer)throw new Error('Unknown analyzer: '+id);return analyzer.run(index)}
export function analyzerSummary(index){const refs=index?.references||[];return{analyzers:ANALYZERS.length,resolved:refs.filter(r=>(r.resolvedSymbols||[]).length===1).length,ambiguous:refs.filter(r=>(r.resolvedSymbols||[]).length>1).length,unresolved:refs.filter(r=>!(r.resolvedSymbols||[]).length).length}}
