import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildIndex } from '../../services/indexClient';
import { attachFileHandles, detectCycles } from '../../services/repository';
import { detectProjectPackages } from '../../services/intelligence';
import { loadCachedIndex, saveCachedIndex, clearCachedIndex } from '../../services/indexCache';
import { buildArchitectureHealth } from '../../services/health';

/**
 * Owns the codebase index for the opened project so the Dashboard and the Codebase workspace share
 * one index: restore from cache on open, build/cancel/clear, plus the derived cycles and health.
 */
export function useCodebaseIndex(project) {
  const [index, setIndex] = useState(null),
    [indexing, setIndexing] = useState(false),
    [progress, setProgress] = useState(null),
    [source, setSource] = useState(''),
    [error, setError] = useState('');
  const abortRef = useRef(null);
  // Bumped per opened project, so work started for a previous folder never lands on the new one.
  const generationRef = useRef(0);
  const freshIndexRef = useRef(false);

  useEffect(() => {
    const generation = ++generationRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    freshIndexRef.current = false;
    setIndex(null);
    setIndexing(false);
    setProgress(null);
    setSource('');
    setError('');
    if (!project) return;
    (async () => {
      try {
        const cached = await loadCachedIndex(project);
        // A fresh index built while the cache was loading must not be replaced by the older copy.
        if (generation === generationRef.current && cached && !freshIndexRef.current) {
          setIndex(attachFileHandles(cached, project));
          setSource('cached');
        }
      } catch (e) {
        if (generation === generationRef.current)
          setError(e?.message || 'Unable to restore cached index');
      }
    })();
  }, [project]);

  const build = useCallback(async () => {
    if (!project) return;
    const generation = generationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIndexing(true);
    setProgress({
      phase: 'start',
      current: 0,
      total: project.files.filter((f) => f.text).length,
      path: null,
    });
    setError('');
    try {
      const next = attachFileHandles(
        await buildIndex(project, { signal: controller.signal, onProgress: setProgress }),
        project,
      );
      next.project.packages = await detectProjectPackages(next);
      if (generation !== generationRef.current) return;
      freshIndexRef.current = true;
      setIndex(next);
      setSource('fresh');
      await saveCachedIndex(project, next);
    } catch (e) {
      if (generation !== generationRef.current) return;
      if (e?.name === 'AbortError') setError('Indexing cancelled');
      else setError(e?.message || 'Unable to index repository');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIndexing(false);
        setProgress(null);
      }
    }
  }, [project]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(async () => {
    if (!project) return;
    await clearCachedIndex(project);
    setIndex(null);
    setSource('');
  }, [project]);

  const cycles = useMemo(() => detectCycles(index), [index]);
  const health = useMemo(() => buildArchitectureHealth(index, cycles), [index, cycles]);

  return useMemo(
    () => ({ index, indexing, progress, source, error, cycles, health, build, cancel, clear }),
    [index, indexing, progress, source, error, cycles, health, build, cancel, clear],
  );
}
