// Framework and package detection in one place. The indexer detects languages and UI frameworks
// from file extensions (`frameworkSignals` in repository.js) and fills `index.project.packages`
// from the root-most package.json's dependencies (stored on its analysis as `manifest`).

export const PACKAGE_FRAMEWORKS = new Map([
  ['react', 'React'],
  ['react-dom', 'React DOM'],
  ['vue', 'Vue'],
  ['@nestjs/core', 'NestJS'],
  ['express', 'Express'],
  ['fastapi', 'FastAPI'],
  ['flask', 'Flask'],
  ['spring-boot', 'Spring'],
  ['next', 'Next.js'],
  ['nuxt', 'Nuxt'],
  ['vite', 'Vite'],
  ['tailwindcss', 'Tailwind CSS'],
  ['prisma', 'Prisma'],
  ['sequelize', 'Sequelize'],
  ['django', 'Django'],
]);

/** Declared dependencies (`{ name: version }`), each tagged with its framework if known. */
export const packagesFromManifest = (deps) =>
  Object.entries(deps || {}).map(([pkg, version]) => ({
    package: pkg,
    version,
    category: PACKAGE_FRAMEWORKS.get(pkg) || 'Dependency',
    known: PACKAGE_FRAMEWORKS.has(pkg),
  }));

/** The dependencies a package.json declares (runtime, development and peer), or null. */
export function manifestDependencies(text) {
  try {
    const json = JSON.parse(text);
    return {
      ...(json.dependencies || {}),
      ...(json.devDependencies || {}),
      ...(json.peerDependencies || {}),
    };
  } catch {
    return null;
  }
}

/** Whether the index shows evidence of a framework, by detected name or declared package. */
export function hasFramework(index, name) {
  const n = name.toLowerCase();
  return (
    (index?.project?.frameworks || []).some((x) => String(x.name).toLowerCase() === n) ||
    (index?.project?.packages || []).some((x) => {
      const pkg = String(x.package || x.name || '').toLowerCase();
      return pkg === n || pkg.includes(n) || String(x.category).toLowerCase() === n;
    })
  );
}
