import { useEffect, useRef, useState } from 'react';

/**
 * Returns a debounced copy of `text` that only updates after `delay` ms of
 * inactivity.  Designed to feed an aria-live region so screen readers
 * announce the final value instead of every intermediate slider step.
 *
 * @param {string} text  – live text that changes rapidly
 * @param {number} [delay=400] – quiet period in ms before the value settles
 * @returns {string} the debounced text
 */
export function useDebouncedAnnounce(text, delay = 400) {
  const [announced, setAnnounced] = useState(text);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAnnounced(text), delay);
    return () => clearTimeout(timer.current);
  }, [text, delay]);

  return announced;
}
