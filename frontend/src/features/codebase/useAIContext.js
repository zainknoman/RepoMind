import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_BUDGET,
  buildGroundedContext,
  formatPrompt,
  rankFilesForQuestion,
  verifyCitations,
} from '../../services/aiContext';
import { askAI, loadAISettings, promptMessages } from '../../services/ai';
import {
  deleteSavedContext,
  readSavedContexts,
  saveContextRecipe,
} from '../../services/savedContexts';
import { toast } from '../../lib/toast';

const DEFAULT_TASK = 'Explain this code and identify risks, dependencies and suggested changes.';

// State shared by the Context Builder and AI views: the file selection, context options, the last
// grounded context, the prompt, the AI answer and its citation check, and saved context recipes.
export function useAIContext({ index, project, analyzerResults }) {
  const [selected, setSelected] = useState(() => new Set()),
    [options, setOptions] = useState({
      budget: DEFAULT_BUDGET,
      includeDependencies: true,
      includeDependents: false,
      repoMap: true,
      findings: true,
    }),
    [task, setTask] = useState(DEFAULT_TASK),
    // 'question': files ranked by relevance to the task; 'selection': Context Builder selection.
    [source, setSource] = useState('question'),
    [context, setContext] = useState(null),
    [prompt, setPrompt] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [aiSettings, setAiSettings] = useState(() => loadAISettings()),
    [aiBusy, setAiBusy] = useState(false),
    [answer, setAnswer] = useState(''),
    [saved, setSaved] = useState(() => readSavedContexts());

  // Every new index (fresh or restored from cache) resets what depends on it.
  useEffect(() => {
    if (!index) return;
    setSelected(new Set(index.files.slice(0, 25).map((f) => f.path)));
    setContext(null);
    setPrompt('');
    setNotice('');
  }, [index]);

  async function build(files) {
    return buildGroundedContext(index, {
      ...options,
      files,
      findings: options.findings ? analyzerResults : null,
      projectName: project?.name,
    });
  }

  async function run(fn) {
    if (!index) return null;
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (e) {
      const message = e?.message || 'Unable to build context';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const generateContext = () =>
    run(async () => {
      const next = await build([...selected]);
      setContext(next);
      toast.success(`Context generated · ${next.files.length} files`);
      return next;
    });

  const makePrompt = () =>
    run(async () => {
      const files =
        source === 'question'
          ? rankFilesForQuestion(index, task).map((x) => ({
              path: x.path,
              reason: x.reasons.join('; '),
            }))
          : [...selected];
      const next = await build(files);
      setContext(next);
      const text = formatPrompt(task, next.content);
      setPrompt(text);
      return text;
    });

  async function buildPrompt() {
    const text = await makePrompt();
    if (text) toast.success('Prompt built');
    return text;
  }

  async function ask() {
    setAiBusy(true);
    try {
      const text = prompt || (await makePrompt());
      if (!text) return;
      setAnswer(await askAI(aiSettings, promptMessages(text)));
      toast.success('AI response received');
    } catch (e) {
      setAnswer('Error: ' + e.message);
      toast.error('AI request failed: ' + e.message);
    } finally {
      setAiBusy(false);
    }
  }

  const grounding = useMemo(
    () =>
      answer && !answer.startsWith('Error: ')
        ? verifyCitations(answer, index, context?.files || [])
        : null,
    [answer, index, context],
  );

  function save(name) {
    if (!context) return false;
    try {
      const next = saveContextRecipe(saved, {
        name,
        repository: project?.name,
        task,
        // The files chosen, before dependency expansion; the options expand them again on load.
        paths: context.requested,
        options,
        tokens: context.tokens,
        fileCount: context.files.length,
      });
      setSaved(next);
      toast.success(`Snapshot “${next[0].name}” saved`);
      return true;
    } catch (e) {
      toast.error('Unable to save snapshot: ' + e.message);
      return false;
    }
  }

  const load = (item) =>
    run(async () => {
      if (item.legacy) return null;
      const known = new Set(index.files.map((f) => f.path));
      const paths = item.paths.filter((p) => known.has(p));
      const nextOptions = { ...options, ...item.options };
      setSelected(new Set(paths));
      setOptions(nextOptions);
      if (item.task) setTask(item.task);
      setSource('selection');
      const next = await buildGroundedContext(index, {
        ...nextOptions,
        files: paths,
        findings: nextOptions.findings ? analyzerResults : null,
        projectName: project?.name,
      });
      setContext(next);
      setPrompt(formatPrompt(item.task || task, next.content));
      const missing = item.paths.length - paths.length;
      setNotice(
        `Rebuilt “${item.name}” from the current files` +
          (missing
            ? ` (${missing} saved file${missing === 1 ? ' is' : 's are'} no longer indexed)`
            : '') +
          '.',
      );
      toast.success(`Loaded “${item.name}”`);
      return next;
    });

  function remove(id) {
    setSaved((list) => deleteSavedContext(list, id));
    toast.info('Saved context deleted');
  }

  return {
    selected,
    setSelected,
    options,
    setOption: (key, value) => setOptions((o) => ({ ...o, [key]: value })),
    task,
    setTask,
    source,
    setSource,
    context,
    prompt,
    setPrompt,
    busy,
    error,
    notice,
    generateContext,
    buildPrompt,
    aiSettings,
    setAiSettings,
    aiBusy,
    ask,
    answer,
    grounding,
    saved,
    save,
    load,
    remove,
  };
}
