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
    try {
      return await this.state.blockConcurrencyWhile(async () => {
        const storageAdapter: StorageAdapter = {
          storageLabel: 'Cloudflare Durable Object Persistent Storage',
          load: async () => {
            if (this.cachedDb) return this.cachedDb;
            try {
              const stored = await this.state.storage.get<EdgeDatabaseState>('aviator_db_v1');
              if (stored) {
                this.cachedDb = stored;
                return stored;
              }
            } catch (storageErr) {
              console.warn('Durable Object storage.get error:', storageErr);
            }
            return null;
          },
          save: async (nextState: EdgeDatabaseState) => {
            this.cachedDb = nextState;
            try {
              await this.state.storage.put('aviator_db_v1', nextState);
            } catch (storageErr) {
              console.warn('Durable Object storage.put error:', storageErr);
            }
          },
        };

        return await handleEdgeApiRequest(request, this.env, storageAdapter);
      });
    } catch (err: any) {
      console.error('AviatorStore Durable Object error:', err);
      return new Response(
        JSON.stringify({
          error:
            'Durable Object storage error: ' +
            (err instanceof Error ? err.message : String(err)),
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
          },
        }
      );
    }
  }
}

// Fallback memory/KV store if Durable Object binding is not attached or fails
let memoryFallbackDb: EdgeDatabaseState | null = null;

export default {
  async fetch(request: Request, env: EdgeEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        // 1. Prefer Durable Object persistent storage when bound (wrangler.jsonc default)
        if (env.AVIATOR_STORE) {
          try {
            const id = env.AVIATOR_STORE.idFromName('global-aviator-store');
            const stub = env.AVIATOR_STORE.get(id);
            return await stub.fetch(request);
          } catch (doErr) {
            console.warn(
              'Durable Object invocation failed, falling back to KV/memory storage adapter:',
              doErr
            );
          }
        }

        // 2. Fallback to Cloudflare KV when bound, or edge isolate state + signed tokens
        const storageAdapter: StorageAdapter = {
          storageLabel: env.AVIATOR_KV
            ? 'Cloudflare KV Persistent Storage'
            : 'Cloudflare Edge Runtime Storage',
          load: async () => {
            if (env.AVIATOR_KV) {
              try {
                const raw = await env.AVIATOR_KV.get('aviator_db_v1');
                if (raw) {
                  memoryFallbackDb = JSON.parse(raw) as EdgeDatabaseState;
                  return memoryFallbackDb;
                }
              } catch (kvErr) {
                console.warn('KV get failed:', kvErr);
              }
            }
            return memoryFallbackDb;
          },
          save: async (nextState: EdgeDatabaseState) => {
            memoryFallbackDb = nextState;
            if (env.AVIATOR_KV) {
              try {
                await env.AVIATOR_KV.put('aviator_db_v1', JSON.stringify(nextState));
              } catch (kvErr) {
                console.warn('KV put failed:', kvErr);
              }
            }
          },
        };

        return await handleEdgeApiRequest(request, env, storageAdapter);
      } catch (err: any) {
        console.error('Unhandled Worker API error:', err);
        return new Response(
          JSON.stringify({
            error:
              'Worker API error: ' +
              (err instanceof Error ? err.message : 'Unknown server error'),
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
            },
          }
        );
      }
    }

    // Serve Vite static assets for all non-API routes
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
