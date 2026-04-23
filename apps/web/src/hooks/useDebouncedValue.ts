import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stayed unchanged for `delayMs`.
 * Initial render returns `value` immediately (no wait).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = globalThis.setTimeout(() => setDebounced(value), delayMs);
    return () => globalThis.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
