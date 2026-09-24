export function buildArchitectureHealth(index,cycles=[]){
  if(!index) return null;
  const fileMap=new Map((index.files||[]).map(f=>[f.path,f]));
  const depCounts=new Map(), dependentCounts=new Map();
  for(const e of index.dependencies||[]){depCounts.set(e.from,(depCounts.get(e.from)||0)+1);dependentCounts.set(e.to,(dependentCounts.get(e.to)||0)+1)}
  const hotspots=(index.files||[]).map(f=>({path:f.path,dependencies:depCounts.get(f.path)||0,dependents:dependentCounts.get(f.path)||0,symbols:(index.symbols||[]).filter(s=>s.path===f.path).length,tokens:f.tokens||0,score:(depCounts.get(f.path)||0)+(dependentCounts.get(f.path)||0)})).sort((a,b)=>b.score-a.score||b.tokens-a.tokens);
  const parserErrors=(index.files||[]).reduce((n,f)=>n+(f.parseErrors?.length||0),0);
  const signals=[
    {id:'unresolved-imports',severity:index.unresolvedImports?.length?'high':'ok',count:index.unresolvedImports?.length||0,label:'Unresolved relative imports',detail:'Relative imports that could not be mapped to an indexed file.'},
    {id:'unresolved-references',severity:index.stats?.unresolvedReferences?'medium':'ok',count:index.stats?.unresolvedReferences||0,label:'Unresolved symbol references',detail:'Identifiers without a conservative local definition match.'},
    {id:'cycles',severity:cycles.length?'high':'ok',count:cycles.length,label:'Circular dependency paths',detail:'Dependency cycles detected by the local graph.'},
    {id:'parser-errors',severity:parserErrors?'medium':'ok',count:parserErrors,label:'Parser errors',detail:'Files that required fallback parsing or reported recoverable syntax errors.'},
    {id:'external-imports',severity:(index.stats?.externalImports||0)>50?'medium':'info',count:index.stats?.externalImports||0,label:'External imports',detail:'Imports that resolve outside the local indexed file graph.'}
  ];
  return {signals,hotspots:hotspots.slice(0,50),summary:{files:index.files.length,symbols:index.symbols.length,dependencies:index.dependencies.length,cycles:cycles.length,parserErrors,unresolvedImports:index.unresolvedImports?.length||0,unresolvedReferences:index.stats?.unresolvedReferences||0},fileMap};
}
