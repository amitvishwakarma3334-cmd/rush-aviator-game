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

  try {
    if (env.AVIATOR_STORE) {
      try {
        const id = env.AVIATOR_STORE.idFromName('global-aviator-store');
        const stub = env.AVIATOR_STORE.get(id);
        return await stub.fetch(request);
      } catch (doErr) {
        console.warn('Pages DO failed, falling back to KV/isolate:', doErr);
      }
    }

    const storageAdapter: StorageAdapter = {
      storageLabel: env.AVIATOR_KV
        ? 'Cloudflare Pages KV Persistent Storage'
        : 'Cloudflare Pages Edge Runtime',
      load: async () => {
        if (env.AVIATOR_KV) {
          try {
            const raw = await env.AVIATOR_KV.get('aviator_db_v1');
            if (raw) {
              pagesIsolateDb = JSON.parse(raw) as EdgeDatabaseState;
              return pagesIsolateDb;
            }
          } catch (kvErr) {
            console.warn('Pages KV get error:', kvErr);
          }
        }
        return pagesIsolateDb;
      },
      save: async (nextState: EdgeDatabaseState) => {
        pagesIsolateDb = nextState;
        if (env.AVIATOR_KV) {
          try {
            await env.AVIATOR_KV.put('aviator_db_v1', JSON.stringify(nextState));
          } catch (kvErr) {
            console.warn('Pages KV put error:', kvErr);
          }
        }
      },
    };

    return await handleEdgeApiRequest(request, env, storageAdapter);
  } catch (err: any) {
    console.error('Unhandled Cloudflare Pages API error:', err);
    return new Response(
      JSON.stringify({
        error:
          'Pages API error: ' + (err instanceof Error ? err.message : 'Unknown server error'),
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
};
