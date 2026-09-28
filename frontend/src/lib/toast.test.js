import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissToast, getToasts, subscribeToasts, toast } from './toast';

describe('toast store', () => {
  afterEach(() => getToasts().forEach((t) => dismissToast(t.id)));

  it('queues toasts, notifies subscribers and caps the queue', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToasts(listener);
    for (let i = 0; i < 6; i++) toast.success('Copied ' + i);
    expect(getToasts().map((t) => t.message)).toEqual([
      'Copied 2',
      'Copied 3',
      'Copied 4',
      'Copied 5',
    ]);
    expect(listener).toHaveBeenCalledTimes(6);
    unsubscribe();
  });

  it('ignores empty messages and dismisses by id', () => {
    expect(toast.info('')).toBeNull();
    const id = toast.error('Failed');
    expect(getToasts()).toHaveLength(1);
    dismissToast(id);
    expect(getToasts()).toHaveLength(0);
  });

  it('removes toasts after their duration', () => {
    vi.useFakeTimers();
    toast.success('Downloaded a.txt');
    vi.advanceTimersByTime(3000);
    expect(getToasts()).toHaveLength(0);
    vi.useRealTimers();
  });
});
