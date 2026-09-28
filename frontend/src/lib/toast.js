// A tiny global toast store. Any module can call toast.success/error/info; the <Toaster /> mounted
// in App subscribes and renders the queue.
const DURATION = { success: 2600, info: 3200, error: 5000 };
const MAX_VISIBLE = 4;

let toasts = [];
let nextId = 1;
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

export function dismissToast(id) {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) emit();
}

function push(type, message) {
  if (!message) return null;
  const id = nextId++;
  toasts = [...toasts, { id, type, message }].slice(-MAX_VISIBLE);
  emit();
  setTimeout(() => dismissToast(id), DURATION[type]);
  return id;
}

export const toast = {
  success: (message) => push('success', message),
  error: (message) => push('error', message),
  info: (message) => push('info', message),
};

export function subscribeToasts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getToasts = () => toasts;
