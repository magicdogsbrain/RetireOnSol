/**
 * RetireOnSol Leaderboard — Cloudflare Worker
 *
 * Stores and retrieves commitment scores for the community leaderboard.
 *
 * Auth model: NONE — just seekerID (.skr name) and scores.
 * No secrets, no auth tokens, no signatures.
 *
 * Endpoints:
 *   POST   /api/score        — submit score (seekerID + score payload)
 *   GET    /api/leaderboard  — fetch top scores
 *   GET    /api/rank/:id     — fetch a seeker's rank
 */

interface Env {
  LEADERBOARD: KVNamespace;
}

interface ScorePayload {
  totalScore: number;
  dcaStreak: number;
  daysActive: number;
  dcaCompletionRate: number;
  planFunded: boolean;
  timestamp: number;
  appVersion: string;
}

interface StoredEntry {
  seekerID: string;          // .skr name (e.g. "magicspider.skr")
  totalScore: number;
  dcaStreak: number;
  daysActive: number;
  dcaCompletionRate: number;
  planFunded: boolean;
  timestamp: number;
  appVersion: string;
}

// CORS origins allowed
const ALLOWED_ORIGINS = [
  'https://retireonsol.uk',
  'http://localhost',
  'http://localhost:5173',
  'capacitor://localhost',
  'http://localhost:3000',
];

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

function errorResponse(message: string, status: number, request: Request): Response {
  return new Response(message, {
    status,
    headers: corsHeaders(request),
  });
}

/**
 * Build the sorted leaderboard from KV.
 * Sanitizes entries to only include expected fields (strips legacy authToken etc).
 * Legacy entries (keyed by wallet address) use the KV key as a fallback seekerID.
 */
async function buildLeaderboard(kv: KVNamespace, limit: number): Promise<{
  entries: (StoredEntry & { rank: number })[];
  totalUsers: number;
}> {
  const list = await kv.list();
  const entries: { key: string; data: Record<string, unknown> }[] = [];

  for (const key of list.keys) {
    const raw = await kv.get(key.name, 'json') as Record<string, unknown> | null;
    if (raw) entries.push({ key: key.name, data: raw });
  }

  // Normalize to clean StoredEntry — derive seekerID from data or KV key
  const clean: StoredEntry[] = entries.map(({ key, data }) => ({
    seekerID: (data.seekerID as string) || key,
    totalScore: (data.totalScore as number) || 0,
    dcaStreak: (data.dcaStreak as number) || 0,
    daysActive: (data.daysActive as number) || 0,
    dcaCompletionRate: (data.dcaCompletionRate as number) || 0,
    planFunded: (data.planFunded as boolean) || false,
    timestamp: (data.timestamp as number) || 0,
    appVersion: (data.appVersion as string) || '',
  }));

  // Sort by totalScore descending
  clean.sort((a, b) => b.totalScore - a.totalScore);

  const ranked = clean.slice(0, limit).map((e, i) => ({
    ...e,
    rank: i + 1,
  }));

  return { entries: ranked, totalUsers: clean.length };
}

// ── Request Handler ──────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // POST /api/score — submit score (seekerID + score payload)
    if (request.method === 'POST' && path === '/api/score') {
      try {
        const body = await request.json() as {
          seekerID: string;
          score: ScorePayload;
        };

        if (!body.seekerID || !body.score) {
          return errorResponse('Missing seekerID or score', 400, request);
        }

        // Validate seekerID looks like a .skr name
        if (!body.seekerID.endsWith('.skr')) {
          return errorResponse('Invalid seekerID — must be a .skr name', 400, request);
        }

        // Validate score bounds
        if (body.score.totalScore < 0 || body.score.totalScore > 1000) {
          return errorResponse('Score out of bounds', 400, request);
        }

        const now = Date.now();

        // Rate limit: 1 submission per hour
        const existing = await env.LEADERBOARD.get(body.seekerID, 'json') as StoredEntry | null;
        if (existing && (now - existing.timestamp) < 60 * 60 * 1000) {
          return errorResponse('Rate limit: 1 submission per hour', 429, request);
        }

        // Store entry keyed by seekerID
        const entry: StoredEntry = {
          seekerID: body.seekerID,
          totalScore: body.score.totalScore,
          dcaStreak: body.score.dcaStreak,
          daysActive: body.score.daysActive,
          dcaCompletionRate: body.score.dcaCompletionRate,
          planFunded: body.score.planFunded,
          timestamp: now,
          appVersion: body.score.appVersion,
        };

        await env.LEADERBOARD.put(body.seekerID, JSON.stringify(entry));

        // Return updated leaderboard
        const leaderboard = await buildLeaderboard(env.LEADERBOARD, 50);
        return jsonResponse(leaderboard, 200, request);
      } catch {
        return errorResponse('Bad request', 400, request);
      }
    }

    // GET /api/leaderboard
    if (request.method === 'GET' && path === '/api/leaderboard') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const leaderboard = await buildLeaderboard(env.LEADERBOARD, Math.min(limit, 100));
      return jsonResponse(leaderboard, 200, request);
    }

    // GET /api/rank/:seekerID
    if (request.method === 'GET' && path.startsWith('/api/rank/')) {
      const seekerID = decodeURIComponent(path.replace('/api/rank/', ''));
      const leaderboard = await buildLeaderboard(env.LEADERBOARD, 1000);
      const entry = leaderboard.entries.find(e => e.seekerID === seekerID);
      return jsonResponse({
        rank: entry?.rank ?? null,
        totalUsers: leaderboard.totalUsers,
        entry: entry ?? null,
      }, 200, request);
    }

    return errorResponse('Not found', 404, request);
  },
};
