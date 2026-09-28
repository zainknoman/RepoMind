/**
 * What the index actually extracted, per language, so partial data is never shown as complete:
 * a Java file with no dependencies may simply be a language whose imports are not read.
 *
 * imports: 'resolved' (linked by name, Temenos BASIC), 'relative' (relative paths resolved,
 * bare specifiers treated as packages), 'none' (not extracted).
 */

const CODE_LANGUAGES = new Set([
  'JavaScript',
  'JavaScript JSX',
  'TypeScript',
  'TypeScript TSX',
  'Vue',
  'Python',
  'Java',
  'Kotlin',
  'Go',
  'Rust',
  'PHP',
  'C#',
  'C++',
  'C',
  'C/C++ Header',
  'Temenos BASIC',
]);

const RELATIVE_IMPORT_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue']);
const REFERENCE_PARSERS = new Set(['babel-ast', 'temenos-basic']);

/** A bare specifier that probably names a repository folder through a bundler/tsconfig alias. */
function aliasLike(module, topFolders) {
  if (/^(?:@\/|~\/|#)/.test(module)) return true;
  return topFolders.has(module.split('/')[0]);
}

function levelOf(ext) {
  if (ext === '.b') return 'resolved';
  return RELATIVE_IMPORT_EXTENSIONS.has(ext) ? 'relative' : 'none';
}

function noteFor(entry, aliasExample) {
  const { language, imports, references, fallbackFiles, aliasLikeImports } = entry;
  if (imports === 'none')
    return `Symbols only: imports and references are not extracted, so Dependencies and Impact are empty for ${language} files.`;
  const notes = [
    imports === 'resolved'
      ? 'CALL, $INSERT and CALLJ are resolved by routine and class name.'
      : 'Relative imports are resolved; package imports are external.',
  ];
  if (aliasLikeImports)
    notes.push(
      `${aliasLikeImports} import${aliasLikeImports === 1 ? '' : 's'} look like path aliases (e.g. ${aliasExample}) and were treated as packages, so those dependencies are missing.`,
    );
  if (!references) notes.push('References are not extracted, so symbol usage is not linked.');
  else if (fallbackFiles)
    notes.push(
      `${fallbackFiles} file${fallbackFiles === 1 ? '' : 's'} could not be parsed and have no references.`,
    );
  return notes.join(' ');
}

export function analysisCoverage(index) {
  const files = (index?.files || []).filter((f) => CODE_LANGUAGES.has(f.language));
  const topFolders = new Set(
    (index?.files || []).filter((f) => f.path.includes('/')).map((f) => f.path.split('/')[0]),
  );
  const languageOf = new Map(files.map((f) => [f.path, f.language]));
  const aliases = new Map();
  for (const edge of index?.externalDependencies || []) {
    const language = languageOf.get(edge.from);
    if (!language || !aliasLike(edge.module, topFolders)) continue;
    if (!aliases.has(language)) aliases.set(language, []);
    aliases.get(language).push(edge.module);
  }
  const byLanguage = new Map();
  for (const file of files) {
    if (!byLanguage.has(file.language)) byLanguage.set(file.language, []);
    byLanguage.get(file.language).push(file);
  }
  return [...byLanguage]
    .map(([language, group]) => {
      const imports = levelOf(group[0].extension);
      const references = group.some((f) => REFERENCE_PARSERS.has(f.parser));
      const aliasModules = aliases.get(language) || [];
      const entry = {
        language,
        files: group.length,
        imports,
        references,
        fallbackFiles: group.filter((f) => f.parser === 'fallback').length,
        aliasLikeImports: aliasModules.length,
      };
      entry.gap =
        imports === 'none' || !references || entry.aliasLikeImports > 0 || entry.fallbackFiles > 0;
      entry.note = noteFor(entry, aliasModules[0]);
      return entry;
    })
    .sort((a, b) => b.files - a.files || a.language.localeCompare(b.language));
}

const coverageOf = (index) => index?.coverage || analysisCoverage(index);

export const coverageGaps = (index) => coverageOf(index).filter((entry) => entry.gap);

export function coverageFor(index, path) {
  const language = (index?.files || []).find((f) => f.path === path)?.language;
  return coverageOf(index).find((entry) => entry.language === language) || null;
}
