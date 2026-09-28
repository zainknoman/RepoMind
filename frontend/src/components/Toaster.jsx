import { useSyncExternalStore } from 'react';
import { dismissToast, getToasts, subscribeToasts } from '../lib/toast';

const ICONS = { success: '✓', error: '!', info: 'i' };

export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  return (
    <div className="toaster" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={'toast toast-' + t.type}
          role={t.type === 'error' ? 'alert' : 'status'}
        >
          <span className="toast-icon" aria-hidden="true">
            {ICONS[t.type]}
          </span>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
