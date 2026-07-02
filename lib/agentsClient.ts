/**
 * Centralised fetch helper for all server-side calls to the orthoiq-agents backend.
 *
 * Every protected route now requires X-API-Key (Phase 1 audit).
 * Three keys are recognised by the backend (src/middleware/auth.js):
 *   web      → regular user-facing routes
 *   farcaster → miniapp routes (also forwards Authorization: Bearer <jwt>)
 *   admin    → /predictions/resolve/md-review and admin-only routes
 *
 * Recovery routes additionally need X-User-Id or Authorization forwarded;
 * pass jwt/webUserId when calling those paths.
 */

type CallerKey = 'web' | 'farcaster' | 'admin';

function getApiKey(caller: CallerKey): string | undefined {
  switch (caller) {
    case 'web':       return process.env.AEQUOS_AGENTS_WEB_KEY || process.env.ORTHOIQ_AGENTS_WEB_KEY;
    case 'farcaster': return process.env.AEQUOS_AGENTS_FARCASTER_KEY || process.env.ORTHOIQ_AGENTS_FARCASTER_KEY;
    case 'admin':     return process.env.AEQUOS_AGENTS_ADMIN_KEY || process.env.ORTHOIQ_AGENTS_ADMIN_KEY;
  }
}

export interface AgentsFetchInit extends Omit<RequestInit, 'headers'> {
  caller: CallerKey;
  /** Farcaster JWT — forwarded as Authorization: Bearer <jwt> */
  jwt?: string;
  /** web:<uuid> — forwarded as X-User-Id (required for /recovery/* with web caller) */
  webUserId?: string;
}

/**
 * Drop-in fetch wrapper that injects the correct X-API-Key (and optional
 * identity headers) for every call to the orthoiq-agents backend.
 *
 * @param path  Must start with "/" e.g. "/consultation"
 */
export function agentsFetch(path: string, { caller, jwt, webUserId, ...rest }: AgentsFetchInit): Promise<Response> {
  const base = process.env.AEQUOS_AGENTS_URL ?? process.env.ORTHOIQ_AGENTS_URL ?? 'http://localhost:3000';
  const apiKey = getApiKey(caller);

  if (!apiKey) {
    console.warn(`[agentsClient] AEQUOS_AGENTS_${caller.toUpperCase()}_KEY / ORTHOIQ_AGENTS_${caller.toUpperCase()}_KEY not set — backend will reject with 401`);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey     && { 'X-API-Key': apiKey }),
    ...(jwt        && { Authorization: `Bearer ${jwt}` }),
    ...(webUserId  && { 'X-User-Id': webUserId }),
  };

  return fetch(`${base}${path}`, { headers, ...rest });
}

export type ResearchAgentStatus = 'pending' | 'complete' | 'failed' | 'not_found';

export interface ResearchAgentResponse {
  status: ResearchAgentStatus;
  research?: any;
  error?: string;
}

/**
 * Server-side fetch of research agent status from Railway. Mirrors the
 * /api/research/[consultationId] proxy but skips the HTTP self-hop.
 */
export async function fetchResearchStatus(consultationId: string): Promise<ResearchAgentResponse> {
  const res = await agentsFetch(`/research/${consultationId}`, {
    caller: 'web',
    method: 'GET',
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 404) {
    return { status: 'not_found' };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`Research status check failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data as ResearchAgentResponse;
}

/**
 * Best-effort server-side trigger of the research agent. Mirrors the
 * /api/research/trigger proxy. Never throws — returns { ok: false } on any failure.
 */
export async function triggerResearchAgents(params: {
  consultationId: string;
  caseData: any;
  consultationResult?: any;
  userTier?: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const res = await agentsFetch('/research/trigger', {
      caller: 'web',
      method: 'POST',
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      return { ok: false, status: res.status, error: errorText };
    }

    return { ok: true, status: res.status };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error' };
  }
}

/**
 * Server-side fetch of the persisted equipoise cards (with populated evidence
 * ledgers) from Railway. Best-effort: returns { cards: [], ready: false } on
 * 404 / any error, so callers can fall back to the skeleton cards. `ready`
 * mirrors the backend's readiness flag (defaults true when the field is absent).
 */
export async function fetchEquipoiseCards(
  consultationId: string
): Promise<{ cards: any[]; ready: boolean }> {
  try {
    const res = await agentsFetch(`/consultation/${consultationId}/equipoise-cards`, {
      caller: 'web',
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { cards: [], ready: false };
    const data = await res.json();
    const ready = data && typeof data === 'object' && 'ready' in data ? !!data.ready : true;
    if (Array.isArray(data)) return { cards: data, ready };
    if (Array.isArray(data?.cards)) return { cards: data.cards, ready };
    if (Array.isArray(data?.equipoiseCards)) return { cards: data.equipoiseCards, ready };
    return { cards: [], ready };
  } catch {
    return { cards: [], ready: false };
  }
}
