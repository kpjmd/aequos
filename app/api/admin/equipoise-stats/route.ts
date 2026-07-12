import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { agentsFetch } from '@/lib/agentsClient';

// Pure pass-through proxy for the backend's validated equipoise-instrument
// stats (admin superset: gate status, calibration coverage, convergence).
// The response is forwarded verbatim — no metric is recomputed client-side.
export async function GET(_request: NextRequest) {
  const authErr = await requireAdmin();
  if (authErr) return authErr;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const agentsRes = await agentsFetch('/equipoise/stats/admin', {
      caller: 'admin',
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!agentsRes.ok) {
      const errorText = await agentsRes.text().catch(() => 'Unknown error');
      console.error(`[admin/equipoise-stats] Agents service returned ${agentsRes.status}: ${errorText}`);
      return NextResponse.json(
        { error: 'Failed to fetch equipoise stats', status: agentsRes.status },
        { status: agentsRes.status }
      );
    }

    const data = await agentsRes.json();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'Equipoise stats request timed out' }, { status: 504 });
    }
    console.error('[admin/equipoise-stats] Error:', error);
    return NextResponse.json({ error: 'Equipoise stats service unavailable' }, { status: 503 });
  }
}
