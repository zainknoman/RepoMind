import { describe, expect, it } from 'vitest';
import { parseJava } from './javaParser';
import { buildRepositoryIndex } from './repository';
import { toWorkerProject } from './indexProject';

const SOURCE = [
  'package com.acme;',
  '',
  'import com.acme.data.Repo;',
  'import com.acme.util.*;',
  'import static com.acme.util.Strings.trim;',
  'import java.util.List;',
  '',
  '/** Service with a { brace in a comment */',
  '@Component',
  'public class App extends Base implements Runnable {',
  '  private final Repo repo = new Repo();',
  '  private static final String NAME = "a } brace";',
  '',
  '  public App(Repo repo) {',
  '    this.repo = repo;',
  '  }',
  '',
  '  @Override',
  '  public void run() {',
  '    List<String> names = Strings.split(NAME);',
  '    Helper helper = new Helper();',
  '    helper.help(trim(NAME));',
  '    repo.save(names);',
  '    save();',
  '    if (names.isEmpty()) { return; }',
  '  }',
  '',
  '  private void save() {}',
  '',
  '  static class Inner {',
  '    void go() {}',
  '  }',
  '}',
  '',
].join('\n');

const parsed = parseJava(
  { path: 'src/main/java/com/acme/App.java', name: 'App.java', ext: '.java' },
  SOURCE,
);

describe('parseJava', () => {
  it('finds types and methods with their extent, parents and superclass', () => {
    expect(
      parsed.symbols.map(
        (s) => `${s.kind}:${s.parent ? s.parent + '.' : ''}${s.name}:${s.line}-${s.endLine}`,
      ),
    ).toEqual([
      'class:App:10-33',
      'variable:App.repo:11-11',
      'variable:App.NAME:12-12',
      'method:App.App:14-16',
      'method:App.run:19-26',
      'method:App.save:28-28',
      'class:App.Inner:30-32',
      'method:Inner.go:31-31',
    ]);
    expect(parsed.symbols[0].superClass).toBe('Base');
    expect(parsed.java.package).toBe('com.acme');
  });

  it('reads single, wildcard and static imports', () => {
    expect(
      parsed.imports.filter((i) => !i.implicit).map((i) => [i.module, i.line, i.bindings]),
    ).toEqual([
      ['com.acme.data.Repo', 3, [{ local: 'Repo', imported: 'Repo', kind: 'named' }]],
      ['com.acme.util.*', 4, []],
      ['com.acme.util.Strings', 5, [{ local: 'trim', imported: 'trim', kind: 'named' }]],
      ['java.util.List', 6, [{ local: 'List', imported: 'List', kind: 'named' }]],
    ]);
    expect(parsed.imports[1].wildcard).toBe(true);
  });

  it('records type references and calls, with receivers from declared types', () => {
    const identifiers = parsed.references.filter((r) => r.kind === 'identifier').map((r) => r.name);
    expect(identifiers).toEqual(
      expect.arrayContaining(['Base', 'Repo', 'Helper', 'Strings', 'trim', 'NAME']),
    );
    for (const absent of [
      'String',
      'Runnable',
      'Override',
      'Component',
      'names',
      'helper',
      'brace',
    ])
      expect(identifiers).not.toContain(absent);
    const members = parsed.references
      .filter((r) => r.kind === 'member')
      .map((r) => `${r.name}:${JSON.stringify(r.receiver)}`);
    expect(members).toEqual([
      'split:{"object":"Strings"}',
      'help:{"object":"helper","type":"Helper"}',
      'save:{"object":"repo","type":"Repo"}',
      'save:{"this":"App"}',
      'isEmpty:{"object":"names","type":"List"}',
    ]);
  });
});

describe('Java in the index', () => {
  const FILES = {
    'src/main/java/com/acme/App.java': SOURCE,
    'src/main/java/com/acme/Base.java': 'package com.acme;\npublic class Base {}\n',
    'src/main/java/com/acme/Helper.java':
      'package com.acme;\npublic class Helper {\n  public void help(String s) {}\n}\n',
    'src/main/java/com/acme/data/Repo.java':
      'package com.acme.data;\npublic class Repo {\n  public void save(Object o) {}\n}\n',
    'src/main/java/com/acme/util/Strings.java': [
      'package com.acme.util;',
      'public class Strings {',
      '  public static String trim(String s) { return s; }',
      '  public static java.util.List<String> split(String s) { return null; }',
      '}',
    ].join('\n'),
  };

  it('resolves imports, same-package and wildcard classes, and typed calls', async () => {
    const project = toWorkerProject(
      'java',
      Object.entries(FILES).map(([path, content]) => ({
        path,
        name: path.split('/').pop(),
        ext: '.java',
        content,
      })),
    );
    const index = await buildRepositoryIndex(project);
    const app = 'src/main/java/com/acme/App.java';
    expect(
      index.dependencies
        .filter((e) => e.from === app)
        .map((e) => e.to.split('/').pop())
        .sort(),
    ).toEqual(['Base.java', 'Helper.java', 'Repo.java', 'Strings.java', 'Strings.java']);
    expect(index.externalDependencies.map((e) => e.module)).toEqual(['java.util.List']);
    const links = index.references
      .filter((r) => r.from === app && r.resolvedSymbols.length)
      .map(
        (r) =>
          `${r.line} ${r.name} ${r.confidence} -> ${r.resolvedSymbols[0].path.split('/').pop()}`,
      );
    expect(links).toEqual(
      expect.arrayContaining([
        '10 Base high -> Base.java',
        '21 Helper high -> Helper.java',
        '22 help high -> Helper.java',
        '22 trim high -> Strings.java',
        '20 split high -> Strings.java',
        '20 NAME high -> App.java',
        '23 save high -> Repo.java',
        '24 save high -> App.java',
      ]),
    );
    // java.lang types (Runnable, String) and annotations are not references.
    expect(index.stats.unresolvedReferences).toBe(0);
  });
});
