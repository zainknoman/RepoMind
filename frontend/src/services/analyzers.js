// The analyzer contract, registry and runner. Every Codebase analysis that produces findings is an
// analyzer: the built-ins below, and later language/domain packs (e.g. Temenos) that register
// their own. See docs/ANALYZERS.md.
import { hasFramework } from './frameworks';
import { fileCoupling } from './health';

export const SEVERITIES = ['high', 'medium', 'low', 'info'];
const SCOPES = ['index', 'source'];
const DEFAULT_COLUMNS = [
  ['severity', 'Severity'],
  ['title', 'Finding'],
  ['file', 'File'],
  ['line', 'Line'],
];

/**
 * Validates an analyzer definition and returns it frozen.
 *
 *   id           unique, lowercase-kebab
 *   name, category, description
 *   scope        'index' — reads only index metadata; 'source' — also reads file contents
 *   columns      [key, label][] shown in the findings table (default: severity, finding, file, line)
 *   run(context) → finding[] (or a promise of one)
 *
 * The context passed to `run`: { index, readText(path), lineLocator(text), signal }.
 * `readText` is shared by every analyzer in one run, so each file is read at most once.
 */
export function defineAnalyzer(spec) {
  const problems = [];
  if (!/^[a-z0-9][a-z0-9-]*$/.test(spec?.id || '')) problems.push('id must be lowercase-kebab');
  for (const key of ['name', 'category', 'description'])
    if (typeof spec?.[key] !== 'string' || !spec[key].trim()) problems.push(key + ' is required');
  if (!SCOPES.includes(spec?.scope)) problems.push('scope must be "index" or "source"');
  if (typeof spec?.run !== 'function') problems.push('run must be a function');
  const columns = spec?.columns || DEFAULT_COLUMNS;
  if (!Array.isArray(columns) || columns.some((c) => !Array.isArray(c) || c.length !== 2))
    problems.push('columns must be [key, label] pairs');
  if (problems.length)
    throw new Error(`Invalid analyzer "${spec?.id || '?'}": ${problems.join('; ')}`);
  return Object.freeze({ ...spec, columns });
}

/** Fills in the fields every finding has, so views, reports and AI context can rely on them. */
export function normalizeFinding(analyzer, finding) {
  return {
    ...finding,
    analyzer: analyzer.id,
    severity: SEVERITIES.includes(finding?.severity) ? finding.severity : 'info',
    title: String(finding?.title ?? ''),
    file: finding?.file || null,
    line: Number.isInteger(finding?.line) ? finding.line : null,
  };
}

/** Returns offset → 1-based line number for `text`; line starts are computed once. */
export function lineLocator(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return (offset) => {
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** A cached reader over the index's file handles; missing files read as ''. */
export function createSourceReader(index) {
  const cache = new Map();
  return (path) => {
    if (!cache.has(path)) {
      const file = index?._fileHandles?.get(path);
      cache.set(
        path,
        file?.handle ? file.handle.getFile().then((f) => f.text()) : Promise.resolve(''),
      );
    }
    return cache.get(path);
  };
}

/**
 * An analyzer that runs regular expressions over file contents; most framework and domain rules
 * are this shape. Each rule: { pattern, severity?, finding(match, { file, line, lineText }) }.
 * `files(file)` limits which indexed files are read; `key(finding)` removes duplicates.
 */
export function definePatternAnalyzer({ rules, files = () => true, key, ...spec }) {
  const dedupeKey = key || ((f) => [f.file, f.line, f.title].join('|'));
  return defineAnalyzer({
    ...spec,
    scope: 'source',
    async run({ index, readText, signal }) {
      const compiled = rules.map((rule) => ({
        ...rule,
        regex: new RegExp(
          rule.pattern.source,
          rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g',
        ),
      }));
      const seen = new Set(),
        findings = [];
      for (const file of index?.files || []) {
        if (signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
        if (!files(file, index)) continue;
        const text = await readText(file.path);
        if (!text) continue;
        const lineOf = lineLocator(text);
        for (const rule of compiled) {
          if (rule.applies && !rule.applies(file, index)) continue;
          rule.regex.lastIndex = 0;
          let m;
          while ((m = rule.regex.exec(text))) {
            if (!m[0]) rule.regex.lastIndex++;
            const line = lineOf(m.index);
            const start = text.lastIndexOf('\n', m.index) + 1;
            const end = text.indexOf('\n', m.index);
            const lineText = text.slice(start, end === -1 ? undefined : end).replace(/\r$/, '');
            const finding = {
              severity: rule.severity || 'info',
              file: file.path,
              line,
              ...rule.finding(m, { file, line, lineText }),
            };
            const k = dedupeKey(finding);
            if (seen.has(k)) continue;
            seen.add(k);
            findings.push(finding);
          }
        }
      }
      return findings;
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Built-in analyzers

const ROUTE_RULES = [
  {
    framework: 'Express',
    // Not after "@": `@app.get(...)` is a FastAPI decorator.
    pattern:
      /(?<!@)\b(?:app|router)\.(get|post|put|patch|delete|options|head|use)\s*\(\s*['"`]([^'"`]+)['"`]/,
    method: (m) => m[1].toUpperCase(),
    path: (m) => m[2],
  },
  {
    framework: 'NestJS',
    pattern: /@(Get|Post|Put|Patch|Delete|All)\s*\(\s*['"`]?([^'"`)]+)?['"`]?\s*\)/,
    method: (m) => m[1].toUpperCase(),
    path: (m) => m[2] || '/',
  },
  {
    framework: 'FastAPI',
    pattern: /@(?:app|router)\.(get|post|put|patch|delete|options)\s*\(\s*['"`]([^'"`]+)['"`]/,
    method: (m) => m[1].toUpperCase(),
    path: (m) => m[2],
  },
  {
    framework: 'Flask',
    pattern: /@(?:app|blueprint)\.route\s*\(\s*['"`]([^'"`]+)['"`]/,
    method: () => 'ROUTE',
    path: (m) => m[1] || '/',
  },
  {
    framework: 'Spring',
    pattern:
      /@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*(?:\(\s*['"`]([^'"`]+)['"`])?/,
    method: (m) => m[1].replace('Mapping', '').toUpperCase(),
    path: (m) => m[2] || '/',
  },
  {
    framework: 'ASP.NET',
    pattern:
      /\[(HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|Route)(?:\s*\(\s*['"`]([^'"`]+)['"`])?/,
    method: (m) => m[1].replace(/^Http/, '').toUpperCase(),
    path: (m) => m[2] || '/',
  },
];

const routes = definePatternAnalyzer({
  id: 'routes',
  name: 'Route Discovery',
  category: 'Framework',
  description:
    'Finds HTTP route and controller declarations (Express, NestJS, FastAPI, Flask, Spring, ASP.NET).',
  columns: [
    ['method', 'Method'],
    ['path', 'Path'],
    ['framework', 'Framework'],
    ['file', 'File'],
    ['line', 'Line'],
  ],
  rules: ROUTE_RULES.map((rule) => ({
    pattern: rule.pattern,
    finding: (m) => ({
      title: rule.method(m) + ' ' + rule.path(m),
      method: rule.method(m),
      path: rule.path(m),
      framework: rule.framework,
    }),
  })),
  key: (f) => [f.file, f.line, f.method, f.path].join('|'),
});

const COMPONENT_RULES = [
  {
    framework: 'React',
    pattern: /(?:export\s+)?(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_$]*)/,
    kind: 'component',
    applies: (file, index) => /^\.(jsx?|tsx?)$/.test(file.ext) || hasFramework(index, 'React'),
  },
  {
    framework: 'Vue',
    pattern: /<template[\s>]/,
    kind: 'component',
    applies: (file) => file.ext === '.vue',
  },
  { framework: 'NestJS', pattern: /@Controller\s*\(\s*["']([^"']+)["']?\s*\)/, kind: 'controller' },
  { framework: 'Spring', pattern: /@(?:RestController|Controller)\b/, kind: 'controller' },
  {
    framework: 'ASP.NET',
    pattern: /\bclass\s+([A-Za-z0-9_]+)\s*:\s*(?:Controller|ControllerBase)/,
    kind: 'controller',
  },
  { framework: 'FastAPI', pattern: /FastAPI\s*\(/, kind: 'application' },
  { framework: 'Flask', pattern: /Flask\s*\(/, kind: 'application' },
];

const frameworkStructure = definePatternAnalyzer({
  id: 'framework-structure',
  name: 'Framework Structure',
  category: 'Framework',
  description: 'Finds framework components, controllers and application entry points.',
  columns: [
    ['kind', 'Kind'],
    ['title', 'Name'],
    ['framework', 'Framework'],
    ['file', 'File'],
    ['line', 'Line'],
  ],
  rules: COMPONENT_RULES.map((rule) => ({
    pattern: rule.pattern,
    applies: rule.applies || ((file, index) => hasFramework(index, rule.framework)),
    finding: (m, { file, lineText }) => ({
      title: m[1] || file.path.split('/').pop(),
      kind: rule.kind,
      framework: rule.framework,
      evidence: lineText.trim().slice(0, 120),
    }),
  })),
  key: (f) => [f.file, f.line, f.framework, f.kind].join('|'),
});

const symbolResolution = defineAnalyzer({
  id: 'symbol-resolution',
  name: 'Symbol Resolution',
  category: 'Code Intelligence',
  description: 'Lists ambiguous and unresolved references in the index.',
  scope: 'index',
  columns: [
    ['status', 'Status'],
    ['title', 'Reference'],
    ['file', 'File'],
    ['line', 'Line'],
    ['targets', 'Candidates'],
  ],
  run: ({ index }) =>
    (index?.references || [])
      .filter((r) => (r.resolvedSymbols?.length || 0) !== 1)
      .map((r) => ({
        severity: r.resolvedSymbols?.length ? 'low' : 'medium',
        status: r.resolvedSymbols?.length ? 'ambiguous' : 'unresolved',
        title: r.name,
        file: r.from,
        line: r.line,
        targets: (r.resolvedSymbols || []).map((s) => s.path + '::' + s.name).join(', '),
      })),
});

const architectureHotspots = defineAnalyzer({
  id: 'architecture-hotspots',
  name: 'Architecture Hotspots',
  category: 'Architecture',
  description: 'Ranks files by internal dependency fan-in and fan-out.',
  scope: 'index',
  columns: [
    ['file', 'File'],
    ['dependents', 'In'],
    ['dependencies', 'Out'],
    ['score', 'Edges'],
  ],
  run: ({ index }) =>
    fileCoupling(index)
      .filter((x) => x.score > 0)
      .map((x) => ({
        severity: 'info',
        title: x.path,
        file: x.path,
        dependents: x.dependents,
        dependencies: x.dependencies,
        score: x.score,
      })),
});

const SECRET_RULES = [
  {
    id: 'private-key',
    severity: 'high',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  },
  {
    id: 'api-key',
    severity: 'high',
    pattern: /\b(?:api[_-]?key|access[_-]?key)[ \t]*[:=][ \t]*['"][A-Za-z0-9_-]{12,}['"]/i,
  },
  { id: 'aws-access-key', severity: 'high', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    id: 'github-token',
    severity: 'high',
    pattern: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  { id: 'slack-token', severity: 'high', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { id: 'stripe-secret', severity: 'high', pattern: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  {
    id: 'password',
    severity: 'high',
    pattern: /\b(?:password|passwd|pwd)[ \t]*[:=][ \t]*['"][^'"\n]{4,}['"]/i,
  },
  {
    id: 'secret',
    severity: 'high',
    pattern: /\b(?:secret|client_secret)[ \t]*[:=][ \t]*['"][^'"\n]{6,}['"]/i,
  },
  {
    id: 'token',
    severity: 'medium',
    pattern: /\b(?:access_token|auth_token|bearer_token)[ \t]*[:=][ \t]*['"][^'"\n]{10,}['"]/i,
  },
  {
    id: 'connection-string',
    severity: 'high',
    pattern: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s'"]+/i,
  },
  {
    id: 'private-env',
    severity: 'medium',
    pattern: /\b(?:AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY|DATABASE_URL)[ \t]*=[ \t]*[^\s]+/i,
  },
];

/** True when a line looks like it holds a credential (the secret scan's rules). */
export const looksSecret = (line) => SECRET_RULES.some((rule) => rule.pattern.test(line));

/**
 * Masks likely secret values so findings (shown on screen, exported in reports and sent as AI
 * context) never repeat the credential itself: quoted literals and long token-like runs keep only
 * their first 4 characters.
 */
export function redactSecret(line) {
  return line
    .replace(/(['"`])([^'"`]{4})[^'"`]*\1/g, '$1$2••••$1')
    .replace(/-----BEGIN ([A-Z ]+)-----.*/, '-----BEGIN $1----- ••••')
    .replace(/\b([A-Za-z0-9_-]{4})[A-Za-z0-9_-]{16,}\b/g, '$1••••')
    .replace(/(:\/\/)[^\s'"]+/g, '$1••••');
}

const secrets = definePatternAnalyzer({
  id: 'security',
  name: 'Secret Scan',
  category: 'Security',
  description: 'Finds likely hard-coded secrets and credentials. Values are masked in the results.',
  columns: [
    ['severity', 'Severity'],
    ['rule', 'Rule'],
    ['file', 'File'],
    ['line', 'Line'],
    ['text', 'Line text'],
  ],
  files: (file) => !/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(file.path),
  rules: SECRET_RULES.map((rule) => ({
    pattern: rule.pattern,
    severity: rule.severity,
    finding: (m, { lineText }) => ({
      title: rule.id,
      rule: rule.id,
      text: redactSecret(lineText.trim()).slice(0, 240),
    }),
  })),
  key: (f) => [f.file, f.line, f.rule].join('|'),
});

// ---------------------------------------------------------------------------------------------
// Registry and runner

const registry = new Map();

/** Adds an analyzer (a definition or a spec to validate). Returns a function that removes it. */
export function registerAnalyzer(spec) {
  const analyzer = Object.isFrozen(spec) && spec.columns ? spec : defineAnalyzer(spec);
  if (registry.has(analyzer.id)) throw new Error('Analyzer already registered: ' + analyzer.id);
  registry.set(analyzer.id, analyzer);
  return () => registry.get(analyzer.id) === analyzer && registry.delete(analyzer.id);
}

[routes, frameworkStructure, symbolResolution, architectureHotspots, secrets].forEach(
  registerAnalyzer,
);

/** Registered analyzers' metadata, in registration order. */
export const listAnalyzers = () =>
  [...registry.values()].map(({ id, name, category, description, scope, columns }) => ({
    id,
    name,
    category,
    description,
    scope,
    columns,
  }));

/**
 * Runs analyzers against an index. One failing analyzer does not stop the others: its entry has an
 * `error` instead. Returns { [id]: { findings, ms, error?, ranAt } }.
 */
export async function runAnalyzers(index, ids = [...registry.keys()], options = {}) {
  const readText = options.readText || createSourceReader(index);
  const results = {};
  for (const id of ids) {
    if (options.signal?.aborted) throw new DOMException('Analysis cancelled', 'AbortError');
    const analyzer = registry.get(id);
    if (!analyzer) throw new Error('Unknown analyzer: ' + id);
    const started = performance.now();
    try {
      const findings = await analyzer.run({ index, readText, lineLocator, signal: options.signal });
      if (!Array.isArray(findings)) throw new Error('Analyzer did not return a list of findings');
      results[id] = {
        name: analyzer.name,
        findings: findings.map((f) => normalizeFinding(analyzer, f)),
        ms: Math.round(performance.now() - started),
        ranAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      results[id] = {
        name: analyzer.name,
        findings: [],
        error: error?.message || String(error),
        ms: Math.round(performance.now() - started),
        ranAt: new Date().toISOString(),
      };
    }
    options.onResult?.(id, results[id]);
  }
  return results;
}

/** Runs one analyzer and returns its findings (throws if it fails). */
export async function runAnalyzer(index, id, options) {
  const result = (await runAnalyzers(index, [id], options))[id];
  if (result.error) throw new Error(result.error);
  return result.findings;
}

export const countBySeverity = (findings) =>
  Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));

export function analyzerSummary(index) {
  const refs = index?.references || [];
  return {
    analyzers: registry.size,
    resolved: refs.filter((r) => (r.resolvedSymbols || []).length === 1).length,
    ambiguous: refs.filter((r) => (r.resolvedSymbols || []).length > 1).length,
    unresolved: refs.filter((r) => !(r.resolvedSymbols || []).length).length,
  };
}
