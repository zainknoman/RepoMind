/**
 * Java source → the index's per-file shape: classes, interfaces, enums and records (nested ones
 * with their parent), methods, constructors and fields with their extent from braces; imports
 * (single, wildcard, static) plus an implicit same-package wildcard; references to types,
 * constants and calls, with receivers typed from declarations (`Repo repo`, `new Helper()`).
 * Lower-case names that are not calls (locals, fields) are not references. A brace scanner over
 * the code with comments and literals blanked; offsets are preserved.
 */

const KEYWORDS = new Set(
  (
    'abstract assert boolean break byte case catch char class const continue default do double ' +
    'else enum extends final finally float for goto if implements import instanceof int ' +
    'interface long native new package private protected public return short static strictfp ' +
    'super switch synchronized this throw throws transient try void volatile while var record ' +
    'yield sealed permits non null true false'
  ).split(' '),
);

// java.lang is imported implicitly: these names are never repository symbols.
const JAVA_LANG = new Set(
  (
    'String Object Integer Long Double Float Boolean Character Byte Short Math StrictMath System ' +
    'Thread Runnable Exception RuntimeException Error Throwable IllegalArgumentException ' +
    'IllegalStateException NullPointerException UnsupportedOperationException ' +
    'IndexOutOfBoundsException ArrayIndexOutOfBoundsException ClassCastException ' +
    'ArithmeticException InterruptedException CloneNotSupportedException NumberFormatException ' +
    'SecurityException Override Deprecated SuppressWarnings FunctionalInterface SafeVarargs ' +
    'Iterable Comparable CharSequence StringBuilder StringBuffer Class Enum Record Void Number ' +
    'AutoCloseable Cloneable Process ProcessBuilder Runtime ThreadLocal InheritableThreadLocal'
  ).split(' '),
);

const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'synchronized', 'try', 'do']);
const PRIMITIVE = 'int|long|double|float|boolean|char|byte|short';

/** The source with comments, string/char literals and text blocks blanked (newlines kept). */
export function blankJava(text) {
  const out = text.split('');
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? text.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      blank(i, stop);
      i = stop - 1;
    } else if (c === '"' || c === "'") {
      const quote = c === '"' && text.startsWith('"""', i) ? '"""' : c;
      let j = i + quote.length;
      while (j < text.length && !text.startsWith(quote, j)) {
        if (quote.length === 1 && text[j] === '\n') break;
        j += text[j] === '\\' ? 2 : 1;
      }
      blank(i + quote.length, Math.min(j, text.length));
      i = Math.min(j + quote.length, text.length) - 1;
    }
  }
  return out.join('');
}

function lineLocator(starts) {
  return (offset) => {
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
}

const lastSegment = (name) => name.split('.').pop();
const simpleType = (type) => {
  const base = type.replace(/<.*$/s, '').replace(/\[\]/g, '').trim();
  return /^[A-Z]/.test(lastSegment(base)) ? lastSegment(base) : null;
};

// `Type name` / `var name` declarations: parameters, locals, fields, for-each variables.
const DECLARATION = new RegExp(
  String.raw`(?:^|[;{}(,]|\bfinal)\s*(?:@[\w.]+(?:\([^()]*\))?\s+)*(?:(?:public|protected|private|static|final|transient|volatile)\s+)*((?:[A-Za-z_][\w.]*(?:\s*<[^;=(){}]*>)?(?:\s*\[\s*\])*)|var|${PRIMITIVE})\s+([A-Za-z_]\w*)\s*(?==|;|:|,|\)|$)`,
  'g',
);

export function parseJava(file, content) {
  const source = String(content || '').replace(/\r\n?/g, '\n');
  const code = blankJava(source);
  const starts = [0];
  for (let i = code.indexOf('\n'); i !== -1; i = code.indexOf('\n', i + 1)) starts.push(i + 1);
  const lineAt = lineLocator(starts);
  const position = (offset) => {
    const line = lineAt(offset);
    return { line: line + 1, column: offset - starts[line] + 1, offset };
  };

  const symbols = [],
    imports = [],
    references = [],
    localBindings = [],
    typed = [],
    types = []; // { name, start, end }
  const fieldTypes = new Map(); // type name → Map(field → class)
  const declared = new Set();
  let pkg = null;
  const staticNames = new Set();

  // Package and imports.
  for (const m of code.matchAll(/^\s*package\s+([\w.]+)\s*;/gm)) pkg = m[1];
  for (const m of code.matchAll(/^\s*import\s+(static\s+)?([\w.]+)(\.\*)?\s*;/gm)) {
    const isStatic = Boolean(m[1]);
    const name = m[2];
    const line = position(m.index + m[0].indexOf('import')).line;
    if (m[3] && !isStatic)
      imports.push({
        module: name + '.*',
        line,
        column: 1,
        kind: 'import',
        bindings: [],
        wildcard: true,
      });
    else if (isStatic) {
      const member = m[3] ? null : lastSegment(name);
      if (member) staticNames.add(member);
      imports.push({
        module: m[3] ? name : name.slice(0, name.lastIndexOf('.')),
        line,
        column: 1,
        kind: 'import',
        bindings: member ? [{ local: member, imported: member, kind: 'named' }] : [],
        static: true,
      });
    } else {
      const local = lastSegment(name);
      imports.push({
        module: name,
        line,
        column: 1,
        kind: 'import',
        bindings: [{ local, imported: local, kind: 'named' }],
      });
    }
  }

  // Structure: every `{` or `;` ends a statement whose text (since the last boundary) tells what
  // it declares.
  const stack = []; // { kind: 'type' | 'method' | 'block', name?, symbol?, start, pending }
  const innermostType = () => stack.findLast((b) => b.kind === 'type');
  const innermostMethod = () => stack.findLast((b) => b.kind === 'method');
  const addSymbol = (name, kind, offset, extra = {}) => {
    const symbol = { name, kind, ...position(offset), ...extra };
    delete symbol.offset;
    symbols.push(symbol);
    declared.add(offset);
    const method = innermostMethod();
    if (method) method.pending.push(symbol);
    return symbol;
  };
  const addDeclarations = (text, base, method, owner) => {
    for (const m of text.matchAll(DECLARATION)) {
      const [, type, name] = m;
      if (KEYWORDS.has(name) || (KEYWORDS.has(type) && type !== 'var' && !PRIMITIVE.includes(type)))
        continue;
      const nameAt = base + m.index + m[0].lastIndexOf(name);
      const className =
        type === 'var'
          ? /^\s*=\s*new\s+([A-Z]\w*)/.exec(text.slice(m.index + m[0].length))?.[1] || null
          : simpleType(type);
      if (owner) {
        // A field of the type.
        addSymbol(name, 'variable', nameAt, { parent: owner.name, endLine: position(nameAt).line });
        if (className) owner.typedFields.push({ name, type: className });
      } else if (method) {
        const binding = { name };
        localBindings.push(binding);
        method.pending.push(binding);
        declared.add(nameAt);
        if (className) {
          const item = { name, type: className };
          typed.push(item);
          method.pending.push(item);
        }
      }
    }
  };

  let boundary = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c !== '{' && c !== '}' && c !== ';') continue;
    const text = code.slice(boundary, i);
    const base = boundary;
    boundary = i + 1;
    if (c === '}') {
      const block = stack.pop();
      if (!block) continue;
      if (block.symbol) block.symbol.endLine = position(i).line;
      if (block.kind === 'type') {
        types.push({ name: block.name, start: block.start, end: i });
        fieldTypes.set(block.name, new Map(block.typedFields.map((f) => [f.name, f.type])));
      }
      for (const item of block.pending || []) {
        item.scopeStart = block.start;
        item.scopeEnd = i;
      }
      continue;
    }
    // Statements in parentheses (for (…; …; …)) are not declarations of the type.
    const top = stack[stack.length - 1];
    const inTypeBody = top?.kind === 'type';
    const typeDecl = /\b(class|interface|enum|record)\s+([A-Za-z_]\w*)/.exec(text);
    if (c === '{' && typeDecl && !/\bnew\s/.test(text.slice(0, typeDecl.index))) {
      const owner = innermostType();
      const extendsMatch = /\bextends\s+([A-Za-z_][\w.]*)/.exec(text);
      const symbol = addSymbol(
        typeDecl[2],
        typeDecl[1] === 'interface' ? 'interface' : 'class',
        base + typeDecl.index + typeDecl[0].lastIndexOf(typeDecl[2]),
        {
          ...(owner ? { parent: owner.name } : {}),
          ...(extendsMatch && typeDecl[1] !== 'interface'
            ? { superClass: lastSegment(extendsMatch[1]) }
            : {}),
        },
      );
      if (typeDecl[1] === 'record') {
        // Record components are fields.
        const open = text.indexOf('(', typeDecl.index);
        if (open > 0) addDeclarations(text.slice(open), base + open, null, null);
      }
      stack.push({ kind: 'type', name: typeDecl[2], symbol, start: base, typedFields: [] });
      continue;
    }
    const signature =
      inTypeBody &&
      /([A-Za-z_]\w*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(?:throws\s+[\w.,\s]+)?\s*(?:default\s+[^;{]*)?$/.exec(
        text,
      );
    if (
      signature &&
      !CONTROL.has(signature[1]) &&
      !KEYWORDS.has(signature[1]) &&
      // `Repo repo = new Repo();` is a field with an initializer, not a method.
      !text.slice(0, signature.index).includes('=')
    ) {
      const nameAt = base + signature.index;
      const symbol = addSymbol(signature[1], 'method', nameAt, { parent: top.name });
      const block = { kind: 'method', symbol, start: base, pending: [] };
      addDeclarations(`(${signature[2]})`, nameAt + signature[0].indexOf('('), block, null);
      if (c === '{') stack.push(block);
      else symbol.endLine = symbol.line;
      continue;
    }
    if (c === ';' && inTypeBody && !/[()]/.test(text.replace(/=.*/s, ''))) {
      addDeclarations(text, base, null, top);
      continue;
    }
    if (c === ';' || c === '{') {
      const method = innermostMethod();
      if (method) addDeclarations(text, base, method, null);
    }
    if (c === '{') stack.push({ kind: 'block', start: base, pending: [] });
  }
  const typeAt = (offset) => {
    let best = null;
    for (const t of types)
      if (offset >= t.start && offset <= t.end && (!best || t.start > best.start)) best = t;
    return best?.name || null;
  };
  // The class of `name` at `offset`: a typed local or parameter, else a field of the enclosing
  // type (a local without a known class shadows the field).
  const typedAt = (name, offset) => {
    let best = null;
    for (const t of typed)
      if (t.name === name && offset >= t.scopeStart && offset <= t.scopeEnd)
        if (!best || t.scopeStart > best.scopeStart) best = t;
    if (best) return best.type;
    // A local without a known class shadows a field.
    for (const b of localBindings)
      if (b.name === name && offset >= b.scopeStart && offset <= b.scopeEnd) return null;
    return fieldTypes.get(typeAt(offset))?.get(name) || null;
  };

  // References.
  for (const m of code.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const name = m[0];
    const at = m.index;
    if (declared.has(at) || /[\w$]/.test(code[at - 1] || '')) continue;
    const lineStart = starts[lineAt(at)];
    if (/^\s*(?:package|import)\b/.test(code.slice(lineStart, at + 1))) continue;
    const before = code.slice(Math.max(0, at - 200), at);
    if (/@\s*$/.test(before)) continue; // annotation
    const after = code.slice(at + name.length, at + name.length + 3);
    const call = /^\s*\(/.test(after);
    if (/\.\s*$/.test(before)) {
      if (!call) continue;
      const object = /([A-Za-z_$][\w$]*)\s*\.\s*$/.exec(before);
      const prefix = object ? before.slice(0, object.index) : '';
      // `this.field.name()`: the field's declared class.
      const fieldType =
        object && /\bthis\s*\.\s*$/.test(prefix) && fieldTypes.get(typeAt(at))?.get(object[1]);
      const chained = object && /[.)\]]\s*$/.test(prefix);
      let receiver;
      if (fieldType) receiver = { object: object[1], type: fieldType };
      else if (!object || chained) receiver = { other: true };
      else if (object[1] === 'this') receiver = { this: typeAt(at) };
      else if (object[1] === 'super') receiver = { super: typeAt(at) };
      else {
        const type = /^[a-z_$]/.test(object[1]) ? typedAt(object[1], at) : null;
        receiver = { object: object[1], ...(type ? { type } : {}) };
      }
      references.push({ name, ...position(at), kind: 'member', receiver, call });
      continue;
    }
    if (KEYWORDS.has(name) || JAVA_LANG.has(name) || name.length < 2) continue;
    if (/^[A-Z]/.test(name)) {
      references.push({ name, ...position(at), kind: 'identifier' });
      continue;
    }
    if (!call || /\bnew\s+$/.test(before)) continue;
    // An unqualified call: a static import, or a method of the enclosing class.
    if (staticNames.has(name)) references.push({ name, ...position(at), kind: 'identifier' });
    else
      references.push({
        name,
        ...position(at),
        kind: 'member',
        receiver: { this: typeAt(at) },
        call: true,
      });
  }

  if (pkg)
    // Classes of the same package are visible without an import.
    imports.push({
      module: pkg + '.*',
      line: 1,
      column: 1,
      kind: 'import',
      bindings: [],
      wildcard: true,
      implicit: true,
    });

  return {
    parser: 'java',
    symbols,
    imports,
    exports: [],
    references,
    localBindings,
    parseErrors: [],
    java: { package: pkg },
  };
}
