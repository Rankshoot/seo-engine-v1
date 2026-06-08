export interface UsageLogContext {
  userId?: string;
  projectId?: string;
  /** Logical feature name, e.g. `keyword_discovery`, `blog_generate`. */
  feature?: string;
}

type AlsStore = {
  run: <T>(context: UsageLogContext, fn: () => T) => T;
  getStore: () => UsageLogContext | undefined;
};

const isServer = typeof window === "undefined";

function getAls(): AlsStore | null {
  if (!isServer) return null;
  try {
    const { AsyncLocalStorage } = require("async_hooks") as typeof import("async_hooks");
    const g = globalThis as typeof globalThis & { __serpcraftUsageAls?: AlsStore };
    if (!g.__serpcraftUsageAls) {
      g.__serpcraftUsageAls = new AsyncLocalStorage<UsageLogContext>() as unknown as AlsStore;
    }
    return g.__serpcraftUsageAls;
  } catch (err) {
    console.warn("[log-context] Failed to load AsyncLocalStorage:", err);
    return null;
  }
}

function runInContext<T>(context: UsageLogContext, fn: () => T): T {
  const als = getAls();
  if (!als) return fn();
  const parent = als.getStore() ?? {};
  return als.run({ ...parent, ...context }, fn);
}

export function runWithUsageLogContext<T>(
  context: UsageLogContext,
  fn: () => Promise<T>
): Promise<T>;
export function runWithUsageLogContext<T>(
  context: UsageLogContext,
  fn: () => T
): T;
export function runWithUsageLogContext<T>(
  context: UsageLogContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return runInContext(context, fn);
}

export function getUsageLogContext(): UsageLogContext {
  const als = getAls();
  return als?.getStore() ?? {};
}

export function mergeUsageLogContext(
  input: Partial<UsageLogContext>
): UsageLogContext {
  const ctx = getUsageLogContext();
  return {
    userId: input.userId ?? ctx.userId,
    projectId: input.projectId ?? ctx.projectId,
    feature: input.feature ?? ctx.feature,
  };
}
