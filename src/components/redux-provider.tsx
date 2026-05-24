"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeStore, persistState, type AppStore } from "@/lib/redux/store";

export function ReduxProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [store] = useState<AppStore>(() => makeStore());

  useEffect(() => {
    const unsubscribe = store.subscribe(() => persistState(store.getState()));
    return unsubscribe;
  }, [store]);

  return <Provider store={store}>{children}</Provider>;
}
