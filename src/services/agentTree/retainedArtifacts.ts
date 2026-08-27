/**
 * RetainedArtifactStore — general-purpose companion to compact v2's
 * EvictionStore. The eviction store only serves what the reducers removed;
 * this lets any producer (tool wrappers, agents, workflows) park large
 * content outside the context window and recall it by handle later.
 *
 * Own file namespace (`<session>-artifacts/` next to session storage) so it
 * never collides with the reducers' `<session>-evictions/` index.
 */
import { join } from 'node:path';
import { roughTokenCountEstimation } from '../../services/tokenEstimation.js';
import { createEvictionStore, type EvictionRecord, type EvictionStore } from '../compact/v2/evictionStore.js';

export type RetainedArtifact = EvictionRecord;

const stores = new Map<string, EvictionStore>();

interface TestPin {
  sessionId: string;
  base: string;
}

let testPin: TestPin | undefined;

/** Test hook — pin sessionId + temp base dir instead of real session storage. */
export function setArtifactHomeOverrideForTests(pin?: TestPin): void {
  stores.clear();
  testPin = pin;
}

function resolve(sessionId?: string): { sessionId: string; store: EvictionStore } {
  let sid = sessionId ?? testPin?.sessionId;
  let dir: string | undefined;
  if (!sid) {
    // ponytail: lazy require keeps bootstrap/sessionStorage out of every importer's cycle
    const state = require('../../bootstrap/state.js') as typeof import('../../bootstrap/state.js');
    sid = state.getSessionId();
    const { getProjectDir } =
      require('../../utils/sessionStorage.js') as typeof import('../../utils/sessionStorage.js');
    dir = join(getProjectDir(state.getOriginalCwd()), `${sid}-artifacts`);
  }
  if (testPin) dir = join(testPin.base, 'artifacts');

  let store = stores.get(sid);
  if (!store) {
    try {
      store = createEvictionStore({ sessionId: sid, ...(dir ? { dir } : {}) });
    } catch {
      store = safeMemoryStore();
    }
    stores.set(sid, store);
  }
  return { sessionId: sid, store };
}

function safeMemoryStore(): EvictionStore {
  try {
    return createEvictionStore({ sessionId: 'fallback', dir: join(process.cwd(), '.clew', 'artifacts-fallback') });
  } catch {
    // final fallback: pure memory handle space (restores lost on restart)
    const records = new Map<string, EvictionRecord>();
    const contents = new Map<string, string>();
    let seq = 0;
    return {
      put(entry, content) {
        const handle = `ra_${seq++}`;
        const rec = { ...entry, handle };
        records.set(handle, rec);
        contents.set(handle, content);
        return rec;
      },
      get(h) {
        const r = records.get(h);
        return r && contents.has(h) ? { record: r, content: contents.get(h)! } : undefined;
      },
      list() {
        return [...records.values()];
      },
      parkedTokens() {
        return [...records.values()].reduce((n, r) => n + r.tokens, 0);
      },
    };
  }
}

/** Persist content and get back a stub line embeddable in place of the full text. */
export function retainArtifact(
  label: string,
  content: string,
  opts?: { sessionId?: string; kind?: RetainedArtifact['kind'] },
): { record: RetainedArtifact; stub: string } {
  const { store } = resolve(opts?.sessionId);
  const record = store.put(
    {
      kind: opts?.kind ?? 'artifact',
      label,
      tokens: roughTokenCountEstimation(content),
      reducer: 'snip', // ponytail: borrows ReducerName; artifacts aren't reducer output — widen enum if analytics cares
      turn: 0,
    },
    content,
  );
  return {
    record,
    stub: `[retained: ${label} — ~${record.tokens} tokens — recall with restoreArtifact("${record.handle}")]`,
  };
}

/** Recall by handle across live stores, falling back to a cold disk read. */
export function recallArtifact(handle: string): { record: RetainedArtifact; content: string } | undefined {
  for (const store of stores.values()) {
    const hit = store.get(handle);
    if (hit) return hit;
  }
  try {
    const { store } = resolve();
    return store.get(handle) ?? undefined;
  } catch {
    return undefined;
  }
}

export function listRetainedArtifacts(): RetainedArtifact[] {
  const out: RetainedArtifact[] = [];
  for (const store of stores.values()) out.push(...store.list());
  return out.sort((a, b) => b.turn - a.turn || b.tokens - a.tokens);
}
