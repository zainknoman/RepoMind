export const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const cp = (t) => navigator.clipboard?.writeText(t);

export const dl = (n, t) => {
  let a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' }));
  a.download = n;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
