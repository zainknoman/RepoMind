import { useState } from 'react';
import { NAV_GROUPS } from '../../navigation';

const CODEBASE_VIEWS = 'Codebase views';
// Help follows the header: one section per navigation group, then the Codebase views.
const HELP_GROUPS = [...NAV_GROUPS.map(([group]) => group), CODEBASE_VIEWS];

export function HelpPage() {
  const [active, setActive] = useState('dashboard');
  const features = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      icon: '📊',
      group: 'Understand',
      definition:
        'The investigation starting point: it builds or restores the code index and shows what needs attention, each item linked to the Codebase view that explains it. The repository profile follows below.',
      features: [
        'Workflow guide: Open → Index → Understand → Investigate → Analyze → Report / AI',
        'Build the code index without leaving the Dashboard; cached indexes are restored automatically',
        'Health signals, dependency hotspots, unresolved imports and circular dependencies',
        'One-click links into Impact, Dependencies, Health, Analyzers, Reports and AI',
        'File-type, folder, size and line-count charts',
        'Largest files, tests, configuration and documentation counts',
        'TODO/FIXME markers and sensitive-filename signals',
        'Filterable file list that opens files in the Editor',
      ],
      how: 'Click Open Folder (Chrome or Edge on desktop), then Build Project Index in Investigate. Click any signal, hotspot or unresolved import to open it in Codebase. Use Refresh index after files change. Nothing is uploaded.',
      example:
        'Open a project containing src/, package.json and README.md. The Dashboard shows its file types, top-level folders and review signals.',
    },
    {
      id: 'codebase',
      title: 'Codebase Intelligence',
      icon: '🧠',
      group: 'Understand',
      definition:
        'The central intelligence workspace. RepoMind indexes the selected project into a local graph of files, symbols, references, imports, exports and dependencies.',
      features: [
        'AST-backed JavaScript, JSX, TypeScript and TSX analysis',
        'Definitions, references and imported-by relationships',
        'Dependency graph, cycles and architecture hotspots',
        'Health and analyzer workspaces',
        'Transitive impact: every file and symbol that could be affected, with confidence and blind spots',
        'Method calls through objects (this.save(), store.put(), ns.fn()) are linked to the methods they call',
        'Context building',
        'Git change impact: what uncommitted work or a commit could affect, as a Markdown report',
        'Git and AI workspace integration',
        'Documentation reports and architecture diagrams',
      ],
      how: 'Open a folder, select Codebase, then click Build / Refresh Index. Use the views (Overview, Symbols, Dependencies, Impact, Health, Analyzers, Git, Diagram, Reports, Context Builder and AI) to investigate the indexed project. The index is cached locally in IndexedDB.',
      example:
        'If src/api/user.js imports src/services/auth.js, the dependency and symbol views can show that relationship and help trace impact before editing auth.js.',
    },
    {
      id: 'explorer',
      title: 'Explorer',
      icon: '🗂️',
      group: 'Explore',
      definition: 'A local file browser for the opened project.',
      features: [
        'Filter files by path or filename',
        'Open supported text files in the editor',
        'Quickly inspect project structure',
      ],
      how: 'Open a folder and choose Explorer. Type part of a path in the filter and click a file.',
      example: 'Enter “controller” to narrow a large project to controller-related files.',
    },
    {
      id: 'search',
      title: 'Search',
      icon: '🔎',
      group: 'Explore',
      definition:
        'One search for the whole project: symbols from the code index, file paths and source text, opening matching files at the relevant result.',
      features: [
        'Symbols (when the code index is built), file paths and text in one result list',
        'Regex and match-case options',
        'Line numbers and matching source snippets',
        'Result viewer with next/previous matches',
        'Open a result directly in Editor',
      ],
      how: 'Enter a search term and press Enter or Search. Build the code index in Codebase to include symbols. Click a result to inspect the surrounding file.',
      example: 'Search for “PhoneNoValidation” to find every source line that references the hook.',
    },
    {
      id: 'editor',
      title: 'Editor',
      icon: '📝',
      group: 'Explore',
      definition: 'A browser-based editor for supported text files opened from the local folder.',
      features: [
        'Find and replace',
        'Replace all',
        'Copy and download',
        'Save changes back to the local file',
      ],
      how: 'Open a file from Explorer or Search. Edit the text and click Save. Browser permission is required to write to the selected folder.',
      example:
        'Search for an old API path, open the result, replace it, then Save the file locally.',
    },
    {
      id: 'ingest',
      title: 'Ingest',
      icon: '🍽️',
      group: 'Analyze',
      definition:
        'Creates a Gitingest-style local representation of the project: summary, directory structure and combined source content.',
      features: [
        'Project summary',
        'Directory tree',
        'Combined file content',
        'Copy and download generated context',
      ],
      how: 'Open a folder, choose Ingest and click Generate. Use the generated Markdown as AI or documentation context.',
      example:
        'Generate an ingest package for a small Node.js service before asking an external AI tool to review its structure.',
    },
    {
      id: 'analyze',
      title: 'Quick Analysis',
      icon: '⚡',
      group: 'Analyze',
      definition:
        'A fast, lightweight index of JavaScript and TypeScript files. For full AST analysis, references and dependencies use Codebase Intelligence.',
      features: [
        'Line counts for every readable file',
        'Functions, classes, imports and exports in JS/TS/Vue files',
        'Filter symbols by name and kind',
      ],
      how: 'Open a folder, choose Quick Analysis and click Run Quick Analysis.',
      example:
        'Use Quick Analysis for a fast first look before building the full Codebase Intelligence index.',
    },
    {
      id: 'transform',
      title: 'Transform',
      icon: '🧩',
      group: 'Analyze',
      definition:
        'Transforms local text files into combined or split artifacts without requiring a backend.',
      features: [
        'Combine files',
        'Reverse split combined content',
        'Copy/download results',
        'ZIP generation',
      ],
      how: 'Open Transform, provide or generate the source content, then use Combine/Split and export actions.',
      example:
        'Combine selected source files into one review document, then download it as a single artifact.',
    },
    {
      id: 'compare',
      title: 'Compare',
      icon: '↔️',
      group: 'Analyze',
      definition:
        'Compares two files line by line and aligns inserted or removed lines, so one change does not mark the rest of the file as different.',
      features: [
        'Side-by-side view with separate line numbers',
        'Added, removed and modified line filters',
        'Search within the diff',
        'Compact +/-/~ output to copy or download',
      ],
      how: 'Open Compare, choose a Left and a Right file and click Compare.',
      example:
        'Compare a before/after Java class to verify that only the intended validation logic changed.',
    },
    {
      id: 'tools',
      title: 'Developer Tools',
      icon: '🧰',
      group: 'Tools',
      definition: 'A compact collection of everyday developer utilities.',
      features: [
        'JSON Formatter',
        'Text Cleanup',
        'Base64',
        'Regex',
        'JWT Decoder',
        'UUID generator',
        'Timestamp conversion',
      ],
      how: 'Open Tools › Developer Tools (or a ?tool=json, ?tool=regex, … link), select the utility, enter the input and click Run. Clear resets the working fields. Operations run in the browser.',
      example: 'Paste minified JSON, choose JSON Formatter and click Run to produce readable JSON.',
    },
    {
      id: 'ofs',
      title: 'Temenos / OFS',
      icon: '📨',
      group: 'Tools',
      definition:
        'Temenos-oriented utilities for developers working with OFS and related banking integration data.',
      features: [
        'OFS Generator',
        'T24 Log Analyzer',
        'T24 source analysis (routines, applications, services, Java links) in Codebase › Analyzers',
      ],
      how: 'Open Tools › Temenos / OFS and select the utility. From a T24 log entry you can send its OFS data straight to the OFS Generator. The tools run in an isolated sandbox. To analyse T24 source code, open the folder of BASIC routines (.b or extensionless, such as BP/ACCOUNT.VALIDATE), build the index and use Codebase: Impact shows which routines call or include a routine, and Analyzers lists routines, applications, services, core calls and Java links.',
      example:
        'Use OFS Generator to build a transaction message from the required application, field and value inputs before testing it in a controlled environment.',
    },
    {
      id: 'markdown',
      title: 'Markdown',
      icon: '📖',
      group: 'Tools',
      definition:
        'A browser Markdown workspace for previewing documentation and Mermaid code blocks.',
      features: [
        'Live Markdown rendering',
        'Mermaid code-block support',
        'Local editing and preview',
      ],
      how: 'Open Tools › Markdown and paste Markdown into the editor. The rendered document appears in the preview area.',
      example:
        'Paste a README section containing a Mermaid flowchart to review its rendered documentation layout.',
    },
    {
      id: 'git-ai',
      title: 'Git + AI',
      icon: '🔀',
      group: CODEBASE_VIEWS,
      definition:
        'Codebase Intelligence can inspect local Git metadata and build provider-neutral AI context without uploading the repository.',
      features: [
        'Branch and HEAD detection',
        'Remote and working-tree signals',
        'Recent local reflog activity',
        'Ask RepoMind: context picked for your question, with a repository map and line numbers',
        'Explain with AI from Impact or Git Change Impact: the analysis, the diff and the affected files go into the prompt',
        'File ranking follows the dependency graph and T24 routine and application names',
        'Likely secrets masked before any provider call',
        'Grounding check of the file:line citations in each answer',
        'Saved contexts keep the file list and options, never the source',
        'AI provider adapters with explicit user action',
      ],
      how: 'Build the Codebase index, open AI, type a question and click Build Prompt: RepoMind picks the relevant files (or uses your Context Builder selection) and shows why each was included. To call a provider, open AI Settings and enter the provider, a model ID and an API key (kept only for this browser session). AI calls occur only when you click Ask AI.',
      example:
        'Select a changed service plus its dependencies, generate context, then send that focused context to a configured AI provider for review.',
    },
    {
      id: 'reports',
      title: 'Reports & Documentation',
      icon: '📄',
      group: CODEBASE_VIEWS,
      definition:
        'Turns local Codebase Intelligence metadata into reusable Markdown documentation.',
      features: [
        'Project architecture and technology report',
        'Module-level reports',
        'API and security findings when available',
        'Dependency hotspot and review summaries',
        'Copy and download Markdown',
      ],
      how: 'Build the index, open Reports, choose Project Report or Module Report, review the generated Markdown and export it.',
      example:
        'Generate a module report for src/payments/service.js before a code review to document its imports, exports, symbols and dependencies.',
    },
    {
      id: 'diagram',
      title: 'Architecture Diagram',
      icon: '🗺️',
      group: CODEBASE_VIEWS,
      definition:
        'Visualizes the dependency architecture generated from the local index using Mermaid.js.',
      features: [
        'Generated dependency diagrams',
        'Lazy Mermaid rendering',
        'SVG preview',
        'Re-render, copy and download controls',
      ],
      how: 'Build the Codebase index, open Diagram and generate the Mermaid graph. Mermaid is loaded only when visualization is requested.',
      example:
        'A project with api → services → repositories relationships can be rendered as a visual dependency map.',
    },
    {
      id: 'health',
      title: 'Health & Analyzers',
      icon: '🩺',
      group: CODEBASE_VIEWS,
      definition:
        'Provides heuristic signals about unresolved imports/references, cycles, parser errors, dependency hotspots and framework structure.',
      features: [
        'Architecture health signals',
        'Extensible analyzer registry',
        'Framework structure analysis',
        'Route discovery',
        'Symbol resolution status with confidence: resolved, ambiguous, guessed by name, unresolved',
        'Analysis coverage per language (Overview): what the index could and could not extract',
        'Route discovery and secret scans',
        'Temenos T24 / Transact analyzers when the folder contains BASIC routines',
        'Run All, severity per finding, and one click from a finding to the file',
      ],
      how: 'Build the index and open Health or Analyzers. Run the available analyzers and inspect their findings. These are signals, not formal security or compiler diagnostics.',
      example:
        'An unresolved relative import can be surfaced as a health issue so you can inspect the path before it causes a runtime or build problem.',
    },
    {
      id: 'security',
      title: 'Security Scan',
      icon: '🔐',
      group: CODEBASE_VIEWS,
      definition:
        'A local heuristic scan for likely secrets, credentials, private keys and connection strings.',
      features: [
        'API-key and token patterns',
        'Password/secret patterns',
        'Private-key detection',
        'Database connection string heuristics',
        'Matched values are masked, so reports never repeat the secret',
      ],
      how: 'Build the index, open Analyzers and run the Secret Scan. Treat matches as review signals; false positives are possible.',
      example:
        'A hard-coded DATABASE_URL or private-key filename can be flagged for manual review.',
    },
    {
      id: 'api',
      title: 'API Discovery',
      icon: '🌐',
      group: CODEBASE_VIEWS,
      definition: 'Discovers common API and route declarations from supported framework patterns.',
      features: [
        'Express and NestJS route patterns',
        'FastAPI and Flask routes',
        'Spring mappings',
        'ASP.NET route patterns',
      ],
      how: 'Build the index, open Analyzers and run Route Discovery. Review discovered routes and source locations.',
      example:
        'A GET /customers route in an Express controller can be surfaced with its file and line information.',
    },
  ];
  const item = features.find((x) => x.id === active) || features[0];
  return (
    <section className="help-page">
      <div className="help-hero">
        <div>
          <div className="hero-badge">❔ RepoMind Help</div>
          <h1>Learn RepoMind</h1>
          <p>
            Every workspace is explained with its purpose, key features, how it works and a
            practical example.
          </p>
        </div>
        <div className="help-note">
          🔒 Local-first
          <br />
          <small>
            Your project stays in the browser unless you explicitly use an external AI provider.
          </small>
        </div>
      </div>
      <div className="help-layout">
        <aside className="help-list">
          {HELP_GROUPS.map((group) => (
            <div key={group}>
              <h3>{group}</h3>
              {features
                .filter((x) => x.group === group)
                .map((x) => (
                  <button
                    key={x.id}
                    className={active === x.id ? 'active' : ''}
                    onClick={() => setActive(x.id)}
                  >
                    <span>{x.icon}</span>
                    <span>{x.title}</span>
                  </button>
                ))}
            </div>
          ))}
        </aside>
        <article className="help-detail">
          <div className="help-title">
            <span>{item.icon}</span>
            <div>
              <small>{item.group}</small>
              <h2>{item.title}</h2>
            </div>
          </div>
          <section>
            <h3>Definition</h3>
            <p>{item.definition}</p>
          </section>
          <section>
            <h3>Key features</h3>
            <ul>
              {item.features.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>How to run / use it</h3>
            <p>{item.how}</p>
          </section>
          <section className="help-example">
            <h3>Example</h3>
            <p>{item.example}</p>
          </section>
        </article>
      </div>
    </section>
  );
}
