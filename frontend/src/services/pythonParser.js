/**
 * Python source → the index's per-file shape: classes, methods, functions and top-level variables
 * (with extent from indentation), imports with bindings, references (identifiers and member calls,
 * `self.x()` as a call on the enclosing class) and local bindings. A line scanner over the code
 * with comments and string contents blanked; offsets are preserved.
 */

const KEYWORDS = new Set(
  (
    'False None True and as assert async await break class continue def del elif else except ' +
    'finally for from global if import in is lambda nonlocal not or pass raise return try while ' +
    'with yield match case self cls'
  ).split(' '),
);

const BUILTINS = new Set(
  (
    'print len range str int float bool dict list set tuple frozenset bytes bytearray object type ' +
    'isinstance issubclass super open input enumerate zip map filter sorted reversed sum min max ' +
    'abs round any all iter next hasattr getattr setattr delattr callable repr hash id format vars ' +
    'dir globals locals staticmethod classmethod property chr ord divmod pow hex oct bin complex ' +
    'memoryview slice compile eval exec breakpoint help NotImplemented Ellipsis __import__ ' +
    '__name__ __file__ __doc__ __init__ __all__ Exception BaseException ValueError TypeError ' +
    'KeyError IndexError AttributeError RuntimeError NotImplementedError StopIteration OSError ' +
    'IOError ImportError ZeroDivisionError AssertionError FileNotFoundError PermissionError ' +
    'TimeoutError LookupError ArithmeticError UnicodeError KeyboardInterrupt SystemExit ' +
    'Warning UserWarning DeprecationWarning PendingDeprecationWarning RuntimeWarning ' +
    'ExceptionGroup BaseExceptionGroup UnicodeDecodeError UnicodeEncodeError ConnectionError ' +
    'RecursionError MemoryError OverflowError EOFError GeneratorExit StopAsyncIteration ' +
    '__slots__ __dict__ __class__ __module__ __qualname__ __annotations__ __version__ __path__ ' +
    'aiter anext'
  ).split(' '),
);

const STRING_PREFIX = /[rRbBuUfF]/;

/** The source with comments and string contents replaced by spaces (newlines kept). */
export function blankPython(text) {
  const out = text.split('');
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '#') {
      const end = text.indexOf('\n', i);
      blank(i, end < 0 ? text.length : end);
      i = end < 0 ? text.length : end;
    } else if (c === '"' || c === "'") {
      // String prefixes (f, rb, …) are not identifiers.
      let p = i;
      while (p > 0 && STRING_PREFIX.test(text[p - 1]) && i - p < 2) p--;
      if (p < i && !/[\w]/.test(text[p - 1] || '')) blank(p, i);
      const raw = /[rR]/.test(text.slice(p, i));
      const triple = text.startsWith(c.repeat(3), i);
      const quote = triple ? c.repeat(3) : c;
      let j = i + quote.length;
      while (j < text.length && !text.startsWith(quote, j)) {
        if (!triple && text[j] === '\n') break;
        j += text[j] === '\\' && !raw ? 2 : 1;
      }
      blank(i + quote.length, Math.min(j, text.length));
      i = Math.min(j + quote.length, text.length) - 1;
    }
  }
  return out.join('');
}

/** Splits a parameter or import list on top-level commas. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0,
    start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      parts.push([text.slice(start, i), start]);
      start = i + 1;
    }
  }
  parts.push([text.slice(start), start]);
  return parts;
}

/** Index of the bracket closing the one at `open`, or -1. */
function closing(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if ('([{'.includes(text[i])) depth++;
    else if (')]}'.includes(text[i]) && --depth === 0) return i;
  }
  return -1;
}

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/g;

export function parsePython(file, content) {
  const source = String(content || '').replace(/\r\n?/g, '\n');
  const code = blankPython(source);
  const lines = code.split('\n');
  const starts = [];
  for (let i = 0, offset = 0; i < lines.length; i++) {
    starts.push(offset);
    offset += lines[i].length + 1;
  }

  const symbols = [],
    imports = [],
    references = [],
    localBindings = [],
    typed = [];
  const declared = new Set(); // offsets of names that declare, not use
  // Open def/class blocks, innermost last: { type, indent, name, start, symbol, pending }.
  const stack = [];
  // Symbols and bindings scoped to a function get its range when the function closes.
  const scoped = (block, item) => block.pending.push(item);
  let lastCodeLine = 0;

  const close = (block) => {
    const end = starts[lastCodeLine] + lines[lastCodeLine].length;
    if (block.symbol) block.symbol.endLine = lastCodeLine + 1;
    for (const item of block.pending) {
      item.scopeStart = block.start;
      item.scopeEnd = end;
    }
  };
  const innermostFunction = () => stack.findLast((b) => b.type === 'function');
  const enclosingClass = () => {
    const fn = stack.findLastIndex((b) => b.type === 'function');
    const cls = stack.findLastIndex((b) => b.type === 'class');
    // `self` belongs to the class whose method we are in (the class right around the function).
    return cls >= 0 && (fn < 0 || cls < fn) ? stack[cls].name : null;
  };
  const addSymbol = (name, kind, line, offset, extra = {}) => {
    const symbol = { name, kind, line: line + 1, column: offset - starts[line] + 1, ...extra };
    symbols.push(symbol);
    declared.add(offset);
    const fn = innermostFunction();
    if (fn) scoped(fn, symbol);
    return symbol;
  };
  const bind = (name, offset, block) => {
    if (!name || KEYWORDS.has(name)) return;
    const binding = { name };
    localBindings.push(binding);
    scoped(block, binding);
    if (offset !== undefined) declared.add(offset);
  };
  const addTyped = (name, type, block) => {
    const item = { name, type };
    typed.push(item);
    if (block) scoped(block, item);
    else {
      item.scopeStart = 0;
      item.scopeEnd = source.length;
    }
  };

  const lineAt = (offset) => {
    let lo = 0,
      hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const readImport = (text, line) => {
    const plain = /^\s*import\s+(.+)$/s.exec(text);
    if (plain)
      for (const [part] of splitTopLevel(plain[1].replace(/[()\\\n]/g, ' '))) {
        const m = /^\s*([\w.]+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
        if (!m) continue;
        // `import a.b` binds `a` (used as `a.b.name`).
        const local = m[2] || m[1].split('.')[0];
        imports.push({
          module: m[1],
          line: line + 1,
          column: 1,
          kind: 'import',
          bindings: local ? [{ local, imported: '*', kind: 'namespace' }] : [],
        });
      }
    const from = /^\s*from\s+([.\w]+)\s+import\s+(.+)$/s.exec(text);
    if (from) {
      const names = from[2].replace(/[()\\\n]/g, ' ');
      const bindings = [];
      for (const [part] of splitTopLevel(names)) {
        const m = /^\s*(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
        if (m) bindings.push({ local: m[2] || m[1], imported: m[1], kind: 'named' });
      }
      imports.push({
        module: from[1],
        line: line + 1,
        column: 1,
        kind: 'import',
        bindings,
        from: true,
      });
    }
    return Boolean(plain || from);
  };

  const scanReferences = (text, base) => {
    let depth = 0;
    const depthAt = [];
    for (let i = 0; i < text.length; i++) {
      if ('([{'.includes(text[i])) depth++;
      else if (')]}'.includes(text[i])) depth--;
      depthAt.push(depth);
    }
    for (const m of text.matchAll(IDENT)) {
      const name = m[0];
      const at = m.index;
      const offset = base + at;
      if (/[0-9]/.test(text[at - 1] || '') || declared.has(offset)) continue;
      const before = text.slice(0, at);
      const after = text.slice(at + name.length);
      const call = /^\s*\(/.test(after);
      const line = lineAt(offset);
      const position = { line: line + 1, column: offset - starts[line] + 1, offset };
      if (/\.\s*$/.test(before)) {
        // obj.name: a member reference when it is called (or on self).
        // The object is a plain name (not `a.b.name` or `f().name`).
        const object = /([A-Za-z_]\w*)\s*\.\s*$/.exec(before);
        const chained = object && /\.\s*$/.test(before.slice(0, object.index));
        let receiver;
        if (!object || chained) receiver = { other: true };
        else if (object[1] === 'self' || object[1] === 'cls') receiver = { this: enclosingClass() };
        else {
          const type = typeAt(object[1], offset);
          receiver = { object: object[1], ...(type ? { type } : {}) };
        }
        if (call || 'this' in receiver)
          references.push({ name, ...position, kind: 'member', receiver, call });
        continue;
      }
      if (KEYWORDS.has(name) || BUILTINS.has(name)) continue;
      // Keyword arguments (f(x=1)) name a parameter, not a value.
      if (depthAt[at] > 0 && /^\s*=(?!=)/.test(after)) continue;
      references.push({ name, ...position, kind: 'identifier' });
    }
  };

  const typeAt = (name, offset) => {
    let best = null;
    for (const t of typed)
      if (
        t.name === name &&
        offset >= (t.scopeStart ?? 0) &&
        offset <= (t.scopeEnd ?? Infinity) &&
        (!best || (t.scopeStart ?? 0) > (best.scopeStart ?? 0))
      )
        best = t;
    return best?.type || null;
  };

  for (let i = 0; i < lines.length;) {
    // One logical line: physical lines joined while brackets are open or a line ends with `\`.
    let end = i,
      depth = 0;
    for (;;) {
      for (const c of lines[end]) {
        if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
      }
      if ((depth > 0 || /\\\s*$/.test(lines[end])) && end + 1 < lines.length) end++;
      else break;
    }
    const base = starts[i];
    const text = code.slice(base, starts[end] + lines[end].length);
    const first = lines[i];
    const next = end + 1;
    if (!first.trim()) {
      i = next;
      continue;
    }
    const indent = first.length - first.trimStart().length;
    while (stack.length && stack[stack.length - 1].indent >= indent) close(stack.pop());

    let skipScan = false;
    const def = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(text);
    const cls = !def && /^(\s*)class\s+([A-Za-z_]\w*)\s*(?:\(\s*([A-Za-z_]\w*)\s*[,)])?/.exec(text);
    if (def) {
      const nameAt = base + text.indexOf(def[2], def[1].length);
      const owner = stack[stack.length - 1];
      const symbol =
        owner?.type === 'class'
          ? addSymbol(def[2], 'method', i, nameAt, { parent: owner.name })
          : addSymbol(def[2], 'function', i, nameAt);
      const block = {
        type: 'function',
        indent,
        name: def[2],
        start: base + def[1].length,
        symbol,
        pending: [],
      };
      const open = text.indexOf('(', def[0].length - 1);
      const shut = closing(text, open);
      if (shut > 0)
        for (const [param, at] of splitTopLevel(text.slice(open + 1, shut))) {
          const m = /^(\s*\**\s*)([A-Za-z_]\w*)(?:\s*:\s*([A-Za-z_]\w*))?/.exec(param);
          if (!m) continue;
          bind(m[2], base + open + 1 + at + m[1].length, block);
          if (m[3] && /^[A-Z]/.test(m[3])) addTyped(m[2], m[3], block);
        }
      stack.push(block);
    } else if (cls) {
      const nameAt = base + text.indexOf(cls[2], cls[1].length + 5);
      const symbol = addSymbol(cls[2], 'class', i, nameAt, cls[3] ? { superClass: cls[3] } : {});
      stack.push({ type: 'class', indent, name: cls[2], start: base, symbol, pending: [] });
    } else if (readImport(text, i)) skipScan = true;
    else {
      const fn = innermostFunction();
      // Names this statement binds: assignment targets (`a, *b = …`), loop targets, `with … as`,
      // `except … as` and `:=`. In a function they are locals; at module level, variables.
      const bound = [];
      const assign =
        /^(\s*)(\*?[A-Za-z_]\w*(?:\s*,\s*\*?[A-Za-z_]\w*)*)\s*(?::[^=\n]+)?(?:[-+*/%&|^@]|\/\/|\*\*|<<|>>)?=(?!=)\s*(?:([A-Z]\w*)\s*\()?/.exec(
          text,
        );
      if (assign)
        for (const m of assign[2].matchAll(IDENT))
          bound.push({ name: m[0], at: base + assign[1].length + m.index, type: assign[3] });
      for (const m of text.matchAll(/\bfor\s+([\w\s,()*]+?)\s+in\b/g)) {
        const from = m.index + m[0].indexOf(m[1]);
        for (const n of m[1].matchAll(IDENT)) bound.push({ name: n[0], at: base + from + n.index });
      }
      for (const m of text.matchAll(/\bas\s+([A-Za-z_]\w*)/g))
        bound.push({ name: m[1], at: base + m.index + m[0].length - m[1].length });
      for (const m of text.matchAll(/\b([A-Za-z_]\w*)\s*:=/g))
        bound.push({ name: m[1], at: base + m.index });
      for (const b of bound) {
        if (fn) {
          bind(b.name, undefined, fn);
          if (b.type) addTyped(b.name, b.type, fn);
        } else if (!stack.length && !KEYWORDS.has(b.name)) {
          addSymbol(b.name, 'variable', i, b.at, {
            endLine: end + 1,
            ...(b.type ? { instanceOf: b.type } : {}),
          });
          if (b.type) addTyped(b.name, b.type, null);
        }
      }
      // Lambda parameters are local to the lambda's statement.
      for (const m of text.matchAll(/\blambda\s+([^:]*):/g))
        for (const n of m[1].matchAll(IDENT))
          localBindings.push({ name: n[0], scopeStart: base, scopeEnd: base + text.length });
    }
    if (!skipScan) scanReferences(text, base);
    lastCodeLine = end;
    i = next;
  }
  while (stack.length) close(stack.pop());

  return {
    parser: 'python',
    symbols,
    imports,
    exports: [],
    references,
    localBindings,
    parseErrors: [],
  };
}
