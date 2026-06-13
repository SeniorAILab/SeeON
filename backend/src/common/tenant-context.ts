import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  readonly orgId: string;
}

const _storage = new AsyncLocalStorage<TenantStore>();

/**
 * Request-scoped org context carrier (AsyncLocalStorage).
 *
 * Set via OrgContextInterceptor (per HTTP request) or PrismaService.withOrgContext
 * (per explicit tenant transaction). Read by PrismaService.$allOperations guard.
 */
export const TenantContext = {
  /**
   * Execute fn with orgId bound in AsyncLocalStorage.
   * The store is available synchronously and across all async continuations
   * spawned within fn.
   */
  run<T>(orgId: string, fn: () => T): T {
    return _storage.run({ orgId }, fn);
  },

  /** Returns the orgId for the current async context, or undefined. */
  getOrgId(): string | undefined {
    return _storage.getStore()?.orgId;
  },
} as const;
