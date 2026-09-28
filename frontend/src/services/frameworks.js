// Framework and package detection in one place. The index worker detects languages and UI
// frameworks from file extensions (`frameworkSignals` in repository.js); after a build, the main
// thread reads package.json here (`index.project.packages`).

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

const readText = async (file) => (file?.handle ? (await file.handle.getFile()).text() : '');

/** Dependencies declared in the root-most package.json, each tagged with its framework if known. */
export async function detectProjectPackages(index) {
  const packageFile = (index?.files || [])
    .filter((f) => f.path === 'package.json' || f.path.endsWith('/package.json'))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  if (!packageFile) return [];
  try {
    const json = JSON.parse(await readText(index._fileHandles?.get(packageFile.path)));
    const deps = {
      ...(json.dependencies || {}),
      ...(json.devDependencies || {}),
      ...(json.peerDependencies || {}),
    };
    return Object.entries(deps).map(([pkg, version]) => ({
      package: pkg,
      version,
      category: PACKAGE_FRAMEWORKS.get(pkg) || 'Dependency',
      known: PACKAGE_FRAMEWORKS.has(pkg),
    }));
  } catch {
    return [];
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
