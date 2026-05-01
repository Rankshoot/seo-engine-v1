"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeStore, persistState, type AppStore } from "@/lib/redux/store";

export function ReduxProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    const unsubscribe = store.subscribe(() => persistState(store.getState()));
    return unsubscribe;
  }, []);

  return <Provider store={storeRef.current}>{children}</Provider>;
}
