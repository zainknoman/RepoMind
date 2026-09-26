import { estimateTokens } from './repository';

const API_PATTERNS = [
  { framework:'Express', pattern:/\b(?:app|router)\.(get|post|put|patch|delete|options|head|use)\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { framework:'NestJS', pattern:/@(Get|Post|Put|Patch|Delete|All)\s*\(\s*['"`]?([^'"`\)]+)?['"`]?\s*\)/g },
  { framework:'FastAPI', pattern:/@(?:app|router)\.(get|post|put|patch|delete|options)\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { framework:'Flask', pattern:/@(?:app|blueprint)\.route\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { framework:'Spring', pattern:/@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*(?:\(\s*['"`]([^'"`]+)['"`])?/g },
  { framework:'ASP.NET', pattern:/\[(HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|Route)(?:\s*\(\s*['"`]([^'"`]+)['"`])?/g }
];

const SECRET_PATTERNS = [
  { id:'private-key', severity:'high', pattern:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { id:'api-key', severity:'high', pattern:/\b(?:api[_-]?key|access[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}['"]/i },
  { id:'aws-access-key', severity:'high', pattern:/\bAKIA[0-9A-Z]{16}\b/ },
  { id:'github-token', severity:'high', pattern:/\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { id:'slack-token', severity:'high', pattern:/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { id:'stripe-secret', severity:'high', pattern:/\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { id:'password', severity:'high', pattern:/\b(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i },
  { id:'secret', severity:'high', pattern:/\b(?:secret|client_secret)\s*[:=]\s*['"][^'"]{6,}['"]/i },
  { id:'token', severity:'medium', pattern:/\b(?:access_token|auth_token|bearer_token)\s*[:=]\s*['"][^'"]{10,}['"]/i },
  { id:'connection-string', severity:'high', pattern:/(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s'"]+/i },
  { id:'private-env', severity:'medium', pattern:/\b(?:AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY|DATABASE_URL)\s*=\s*[^\s]+/i }
];

const PACKAGE_RULES = [
  ['react','React'],['react-dom','React DOM'],['vue','Vue'],['@nestjs/core','NestJS'],
  ['express','Express'],['fastapi','FastAPI'],['flask','Flask'],['spring-boot','Spring'],
  ['next','Next.js'],['nuxt','Nuxt'],['vite','Vite'],['tailwindcss','Tailwind CSS'],
  ['prisma','Prisma'],['sequelize','Sequelize'],['django','Django']
];

async function readFile(file) { return (await file.handle.getFile()).text(); }

export async function searchCode(index, query, options = {}) {
  if (!index || !query?.trim()) return [];
  const needle = query.trim();
  let regex=null;if(options.regex){try{regex=new RegExp(needle, options.caseSensitive ? '' : 'i')}catch(error){return [{type:'error',message:`Invalid regular expression: ${error.message}`}]} }
  const results = [];
  for (const file of index.files) {
    const source = index._fileHandles?.get(file.path);
    if (!source) continue;
    const content = await readFile(source);
    content.split(/\r?\n/).forEach((line, i) => {
      if ((regex ? regex.test(line) : (options.caseSensitive ? line.includes(needle) : line.toLowerCase().includes(needle.toLowerCase())))) {
        results.push({ path:file.path, line:i+1, text:line.trim(), language:file.language });
        if (regex) regex.lastIndex = 0;
      }
    });
  }
  return results;
}

export function searchIndex(index, query) {
  if (!index || !query?.trim()) return [];
  const q=query.toLowerCase();
  return [
    ...(index.symbols||[]).filter(s => s.name.toLowerCase().includes(q)).map(s=>({type:'symbol',label:s.name,path:s.path,line:s.line,detail:s.kind})),
    ...(index.files||[]).filter(f => f.path.toLowerCase().includes(q)).map(f=>({type:'file',label:f.path,path:f.path,detail:f.language})),
    ...(index.dependencies||[]).filter(e => e.from.toLowerCase().includes(q)||e.to.toLowerCase().includes(q)).map(e=>({type:'dependency',label:e.from+' → '+e.to,path:e.from,detail:'dependency'}))
  ];
}

function apiMethod(rule, match) {
  if (rule.framework === 'Flask') return 'ROUTE';
  if (rule.framework === 'Spring') return (match[1] || 'REQUEST').replace('Mapping', '').toUpperCase();
  if (rule.framework === 'ASP.NET') return (match[1] || 'ROUTE').replace(/^Http/i, '').toUpperCase();
  return (match[1] || 'GET').toUpperCase();
}

function apiPath(rule, match) {
  if (rule.framework === 'Flask') return match[1] || '/';
  return match[2] || '/';
}

export async function discoverApis(index) {
  const results=[];
  for(const file of index?.files||[]){
    const source=index._fileHandles?.get(file.path); if(!source) continue;
    const content=await readFile(source);
    for(const rule of API_PATTERNS){
      rule.pattern.lastIndex=0; let m;
      while((m=rule.pattern.exec(content))){
        results.push({
          framework:rule.framework,
          method:apiMethod(rule,m),
          path:apiPath(rule,m),
          file:file.path,
          line:content.slice(0,m.index).split(/\r?\n/).length
        });
      }
    }
  }
  return results.filter((x,i,a)=>a.findIndex(y=>y.file===x.file&&y.line===x.line&&y.path===x.path&&y.method===x.method)===i);
}

export async function scanSecurity(index) {
  const findings=[];
  for(const file of index?.files||[]){
    if(/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(file.path)) continue;
    const source=index._fileHandles?.get(file.path); if(!source) continue;
    const content=await readFile(source);
    const lines=content.split(/\r?\n/);
    for(let i=0;i<lines.length;i++){
      for(const rule of SECRET_PATTERNS){
        if(rule.pattern.test(lines[i])){
          findings.push({id:rule.id,severity:rule.severity,path:file.path,line:i+1,text:lines[i].trim().slice(0,240)});
        }
        rule.pattern.lastIndex=0;
      }
    }
  }
  return findings;
}

export async function detectProjectPackages(index) {
  const packages=[];
  const packageFile=index?.files?.find(f=>f.path==='package.json'||f.path.endsWith('/package.json'));
  if(packageFile){
    try{
      const source=index._fileHandles?.get(packageFile.path);
      const json=JSON.parse(await readFile(source));
      const deps={...(json.dependencies||{}),...(json.devDependencies||{}),...(json.peerDependencies||{})};
      for(const [pkg,version] of Object.entries(deps)){
        const known=PACKAGE_RULES.find(([name])=>name===pkg);
        packages.push({package:pkg,version,category:known?.[1]||'Dependency',known:!!known});
      }
    }catch{}
  }
  return packages;
}

export function buildArchitectureMermaid(index, options={}) {
  if(!index) return 'graph TD\n  Empty[No index]';
  const limit=options.limit||80;
  const edges=index.dependencies.slice(0,limit);
  const ids=new Map();
  const id=path=>{if(!ids.has(path))ids.set(path,'N'+(ids.size+1));return ids.get(path)};
  const label=path=>path.split('/').pop().replace(/[^A-Za-z0-9_.-]/g,'_');
  const lines=['graph TD'];
  for(const e of edges){
    lines.push(`  ${id(e.from)}["${label(e.from)}"] --> ${id(e.to)}["${label(e.to)}"]`);
  }
  if(!edges.length) lines.push('  Empty["No internal dependencies detected"]');
  return lines.join('\n');
}

export function buildDependencyMermaid(index, path) {
  if(!index||!path) return 'graph TD\n  Empty[Select a file]';
  const deps=index.dependencies.filter(e=>e.from===path||e.to===path);
  const id=pathValue=>{let safe=pathValue.replace(/[^A-Za-z0-9]/g,'_');return 'N_'+safe};
  const lines=['graph LR',`  ${id(path)}["${path.split('/').pop()}"]`];
  deps.forEach(e=>{
    if(e.from===path) lines.push(`  ${id(e.from)} --> ${id(e.to)}["${e.to.split('/').pop()}"]`);
    else lines.push(`  ${id(e.from)}["${e.from.split('/').pop()}"] --> ${id(e.to)}`);
  });
  return lines.join('\n');
}

export function intelligenceSummary(index, api=[], security=[], packages=[]) {
  return {
    searchTokens:estimateTokens((index?.symbols||[]).map(s=>s.name).join(' ')),
    apiEndpoints:api.length,
    securityFindings:security.length,
    highSecurityFindings:security.filter(x=>x.severity==='high').length,
    packages:packages.length,
    unresolvedImports:index?.unresolvedImports?.length||0,
    cycles:0
  };
}