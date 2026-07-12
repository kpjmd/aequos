import { NextResponse } from 'next/server';
import { agentsFetch } from '@/lib/agentsClient';

// Pure pass-through proxy for the backend's validated equipoise-instrument
// stats (public field subset). The response is forwarded verbatim — no
// metric is recomputed or defaulted client-side.
export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const agentsRes = await agentsFetch('/equipoise/stats', {
      caller: 'web',
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!agentsRes.ok) {
      const errorText = await agentsRes.text().catch(() => 'Unknown error');
      console.error(`[equipoise-stats] Agents service returned ${agentsRes.status}: ${errorText}`);
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
    console.error('[equipoise-stats] Error:', error);
    return NextResponse.json({ error: 'Equipoise stats service unavailable' }, { status: 503 });
  }
}
