import { toast } from './toast';

export const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Copies text to the clipboard and reports the outcome as a toast. */
export async function cp(t, label = 'Copied to clipboard') {
  if (!t) {
    toast.info('Nothing to copy yet');
    return false;
  }
  try {
    if (!navigator.clipboard) throw new Error('Clipboard is not available in this browser');
    await navigator.clipboard.writeText(t);
    toast.success(label);
    return true;
  } catch (e) {
    toast.error('Copy failed: ' + (e?.message || 'clipboard blocked'));
    return false;
  }
}

/** Downloads text as a file and reports the outcome as a toast. */
export function dl(n, t, type = 'text/plain') {
  if (!t) {
    toast.info('Nothing to download yet');
    return false;
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type }));
    a.download = n;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast.success('Downloaded ' + n);
    return true;
  } catch (e) {
    toast.error('Download failed: ' + (e?.message || 'unknown error'));
    return false;
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
