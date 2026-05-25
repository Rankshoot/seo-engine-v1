"use client";

import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (search input, filter selection).
 * Returns a value that only updates after `delay` ms of stillness.
 */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
