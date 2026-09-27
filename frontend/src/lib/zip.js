import { safeArchivePath } from './transform';

/** Builds a ZIP from {name, content} items and downloads it. JSZip is loaded on demand. */
export async function downloadZip(items, filename) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  items.forEach((x) => zip.file(safeArchivePath(x.name), x.content));
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
