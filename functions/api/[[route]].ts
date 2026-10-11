import {
  handleEdgeApiRequest,
  type EdgeDatabaseState,
  type EdgeEnv,
  type StorageAdapter,
} from '../../src/edge/backend';

let pagesIsolateDb: EdgeDatabaseState | null = null;

interface PagesContext {
  request: Request;
  env: EdgeEnv;
}

export const onRequest = async (context: PagesContext): Promise<Response> => {
  const { request, env } = context;

  if (env.AVIATOR_STORE) {
    const id = env.AVIATOR_STORE.idFromName('global-aviator-store');
    const stub = env.AVIATOR_STORE.get(id);
    return stub.fetch(request);
  }

  const storageAdapter: StorageAdapter = {
    storageLabel: env.AVIATOR_KV
      ? 'Cloudflare Pages KV Persistent Storage'
      : 'Cloudflare Pages Edge Runtime',
    load: async () => {
      if (env.AVIATOR_KV) {
        const raw = await env.AVIATOR_KV.get('aviator_db_v1');
        if (raw) {
          pagesIsolateDb = JSON.parse(raw) as EdgeDatabaseState;
          return pagesIsolateDb;
        }
      }
      return pagesIsolateDb;
    },
    save: async (nextState: EdgeDatabaseState) => {
      pagesIsolateDb = nextState;
      if (env.AVIATOR_KV) {
        await env.AVIATOR_KV.put('aviator_db_v1', JSON.stringify(nextState));
      }
    },
  };

  return handleEdgeApiRequest(request, env, storageAdapter);
};
