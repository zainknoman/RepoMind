const esc=v=>String(v??'').replace(/\r/g,'').trim();
const pct=(a,b)=>b?Math.round(a/b*100):0;
function hotspots(index,limit=15){
 const incoming=new Map(),outgoing=new Map();
 for(const d of index?.dependencies||[]){outgoing.set(d.from,(outgoing.get(d.from)||0)+1);incoming.set(d.to,(incoming.get(d.to)||0)+1)}
 return(index?.files||[]).map(f=>({path:f.path,symbols:(index.symbols||[]).filter(s=>s.path===f.path).length,incoming:incoming.get(f.path)||0,outgoing:outgoing.get(f.path)||0,tokens:f.tokens||0,score:(incoming.get(f.path)||0)*2+(outgoing.get(f.path)||0)})).sort((a,b)=>b.score-a.score).slice(0,limit);
}
export function buildDocumentationReport(index,{name,cycles=[],health,routes=[],security=[]}={}){
 if(!index)return '';
 const repo=name||index.project?.name||'Repository',files=index.files||[],symbols=index.symbols||[];
 const languages=Object.entries(index.languages||{}).sort((a,b)=>b[1]-a[1]);
 const frameworks=(index.project?.frameworks||[]).map(x=>x.name).filter(Boolean);
 const lines=['# '+repo+' — Codebase Report','','Generated from the local RepoMind index.','',
 '## Executive Summary','',
 `- Files: ${index.stats?.files||files.length}`,
 `- Symbols: ${index.stats?.symbols||symbols.length}`,
 `- References: ${index.stats?.references||0}`,
 `- Imports: ${index.stats?.imports||0}`,
 `- Exports: ${index.stats?.exports||0}`,
 `- Internal dependency edges: ${index.stats?.internalEdges||0}`,
 `- External dependencies: ${index.externalDependencies?.length||0}`,
 `- Estimated tokens: ${(index.stats?.tokens||0).toLocaleString()}`,'','## Technology Profile',''];
 lines.push(...frameworks.map(x=>'- Framework: '+x));
 lines.push(...languages.map(([x,c])=>`- ${x}: ${c} files (${pct(c,index.stats?.files||files.length)}%)`));
 if(!frameworks.length&&!languages.length)lines.push('- No framework/language profile detected.');
 lines.push('','## Architecture','','- Circular dependency paths: '+cycles.length,'- Unresolved relative imports: '+(index.unresolvedImports?.length||0),'- Unresolved references: '+(index.stats?.unresolvedReferences||0),'- Parser errors: '+files.reduce((s,f)=>s+(f.parseErrors?.length||0),0),'- Security findings: '+security.length,'','### Dependency Hotspots','');
 lines.push(...hotspots(index).map(x=>`- **${x.path}** — score ${x.score}; ${x.incoming} incoming, ${x.outgoing} outgoing, ${x.symbols} symbols`));
 if(cycles.length)lines.push('','### Circular Dependencies','',...cycles.slice(0,30).map(x=>'- '+x.join(' → ')));
 if(routes.length)lines.push('','## Discovered API Surface','',...routes.slice(0,100).map(x=>`- ${x.method||'ROUTE'} ${x.path||'/'} — ${x.framework||'unknown'} — ${x.file||''}:${x.line||''}`));
 if(security.length)lines.push('','## Security Scan Findings','',...security.slice(0,100).map(x=>`- **${x.severity||'review'}** ${x.id||'finding'} — ${x.path||''}:${x.line||''} — ${esc(x.text||x.detail||'')}`));
 lines.push('','## Key Symbols','',...symbols.slice(0,100).map(s=>`- **${s.name}** (${s.kind}) — ${s.path}:${s.line}${s.parent?' — '+s.parent:''}`));
 const recommendations=[];
 if(index.unresolvedImports?.length)recommendations.push('Resolve missing relative imports before relying on dependency or impact analysis.');
 if((index.stats?.unresolvedReferences||0)>0)recommendations.push('Review unresolved symbol references; framework-specific semantics may require deeper analysis.');
 if(cycles.length)recommendations.push('Review circular dependency paths for unnecessary coupling.');
 if(security.length)recommendations.push('Review security findings manually; the scanner is heuristic.');
 if(!recommendations.length)recommendations.push('No major heuristic review signals were supplied to this report.');
 lines.push('','## Recommended Review Areas','',...recommendations.map(x=>'- '+x),'','## Scope & Limitations','','This report uses local index metadata. Route, framework and security findings are heuristic. RepoMind does not upload repository source during local analysis.');
 return lines.join('\n');
}
export function buildModuleReport(index,path){
 const file=(index?.files||[]).find(x=>x.path===path);if(!file)return '';
 const symbols=(index.symbols||[]).filter(x=>x.path===path);
 const imports=(index.imports||[]).filter(x=>x.path===path||x.file===path);
 const exports=(index.exports||[]).filter(x=>x.path===path||x.file===path);
 const deps=(index.dependencies||[]).filter(x=>x.from===path).map(x=>x.to);
 return ['# '+path,'',`Language: ${file.language||'Unknown'}`,`Lines: ${file.lines||0}`,`Estimated tokens: ${file.tokens||0}`,'','## Symbols',...(symbols.length?symbols.map(x=>`- ${x.name} — ${x.kind} — line ${x.line}`):['- None detected']),'','## Imports',...(imports.length?imports.map(x=>'- '+(x.module||x.source||'unknown')):['- None detected']),'','## Exports',...(exports.length?exports.map(x=>'- '+(x.name||'unknown')):['- None detected']),'','## Dependencies',...(deps.length?deps.map(x=>'- '+x):['- None resolved'])].join('\n');
}