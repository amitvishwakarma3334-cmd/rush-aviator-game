import {
  handleEdgeApiRequest,
  type EdgeDatabaseState,
  type EdgeEnv,
  type StorageAdapter,
} from './edge/backend';

interface DurableObjectStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
}

// Persistent SQLite-backed Durable Object for Cloudflare Workers Free & Paid Plans
export class AviatorStore {
  private state: DurableObjectStateLike;
  private env: EdgeEnv;
  private cachedDb: EdgeDatabaseState | null = null;

  constructor(state: DurableObjectStateLike, env: EdgeEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    return this.state.blockConcurrencyWhile(async () => {
      const storageAdapter: StorageAdapter = {
        storageLabel: 'Cloudflare Durable Object Persistent Storage',
        load: async () => {
          if (this.cachedDb) return this.cachedDb;
          const stored = await this.state.storage.get<EdgeDatabaseState>('aviator_db_v1');
          if (stored) {
            this.cachedDb = stored;
            return stored;
          }
          return null;
        },
        save: async (nextState: EdgeDatabaseState) => {
          this.cachedDb = nextState;
          await this.state.storage.put('aviator_db_v1', nextState);
        },
      };

      return handleEdgeApiRequest(request, this.env, storageAdapter);
    });
  }
}

// Fallback memory/KV store if Durable Object binding is not attached
let memoryFallbackDb: EdgeDatabaseState | null = null;

export default {
  async fetch(request: Request, env: EdgeEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      // 1. Prefer Durable Object persistent storage when bound (wrangler.jsonc default)
      if (env.AVIATOR_STORE) {
        const id = env.AVIATOR_STORE.idFromName('global-aviator-store');
        const stub = env.AVIATOR_STORE.get(id);
        return stub.fetch(request);
      }

      // 2. Fallback to Cloudflare KV when bound, or edge isolate state + signed tokens
      const storageAdapter: StorageAdapter = {
        storageLabel: env.AVIATOR_KV
          ? 'Cloudflare KV Persistent Storage'
          : 'Cloudflare Edge Runtime Storage',
        load: async () => {
          if (env.AVIATOR_KV) {
            const raw = await env.AVIATOR_KV.get('aviator_db_v1');
            if (raw) {
              memoryFallbackDb = JSON.parse(raw) as EdgeDatabaseState;
              return memoryFallbackDb;
            }
          }
          return memoryFallbackDb;
        },
        save: async (nextState: EdgeDatabaseState) => {
          memoryFallbackDb = nextState;
          if (env.AVIATOR_KV) {
            await env.AVIATOR_KV.put('aviator_db_v1', JSON.stringify(nextState));
          }
        },
      };

      return handleEdgeApiRequest(request, env, storageAdapter);
    }

    // Serve Vite static assets for all non-API routes
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
