import { useEffect } from 'react';

/**
 * Calls `handler` when a mousedown lands outside `ref`, while `enabled`.
 * Pass a stable `handler` (e.g. via useCallback) to avoid re-subscribing.
 */
export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  handler: () => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handleMouseDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handler();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [enabled, handler, ref]);
}
