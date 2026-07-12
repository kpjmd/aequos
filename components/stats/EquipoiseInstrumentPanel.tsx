'use client';

import { useEffect, useState } from 'react';
import {
  EquipoiseInstrumentStats,
  EQUIPOISE_CLASS_LABELS,
  EQUIPOISE_CLASS_COLORS,
  classPct,
} from '@/lib/equipoiseStats';

export function EquipoiseInstrumentPanel() {
  const [stats, setStats] = useState<EquipoiseInstrumentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/public/equipoise-stats');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch (error) {
        console.error('Failed to fetch equipoise instrument stats:', error);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/2 mx-auto"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (failed || !stats) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
        <p className="text-sm text-gray-400 italic">Instrument stats are temporarily unavailable.</p>
      </div>
    );
  }

  const { anchor_set, detector, validity } = stats;
  const classEntries = Object.entries(anchor_set.by_class || {});
  const classTotal = classEntries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="space-y-6">
      {/* Anchor set as the asset */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {anchor_set.active.toLocaleString()} expert-ratified decision points across 4 equipoise classes
          </h2>
          <p className="text-sm text-gray-500 mt-1">Anchor set {anchor_set.version}</p>
        </div>

        {classTotal > 0 && (
          <>
            <div className="flex h-8 rounded-lg overflow-hidden mb-3">
              {classEntries.map(([cls, count]) => {
                const pct = classPct(count, classTotal);
                if (pct === 0) return null;
                return (
                  <div
                    key={cls}
                    className={`${EQUIPOISE_CLASS_COLORS[cls] || 'bg-gray-300'} flex items-center justify-center text-white text-xs font-medium`}
                    style={{ width: `${pct}%` }}
                    title={`${EQUIPOISE_CLASS_LABELS[cls] || cls}: ${count}`}
                  >
                    {pct >= 12 && count}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              {classEntries.map(([cls, count]) => (
                <div key={cls} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <div className={`w-2.5 h-2.5 rounded-sm ${EQUIPOISE_CLASS_COLORS[cls] || 'bg-gray-300'}`} />
                  <span>{EQUIPOISE_CLASS_LABELS[cls] || cls}: {count}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Validated performance */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-center gap-3 mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Validated performance</h2>
          {detector.gate_passed && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
              Gate passed
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center">
            <div className="text-4xl font-bold text-emerald-700">{detector.sensitivity.toFixed(3)}</div>
            <div className="mt-1 text-sm font-medium text-gray-700">Sensitivity</div>
            <div className="text-xs text-gray-500">vs target {detector.target.sensitivity}</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center">
            <div className="text-4xl font-bold text-emerald-700">{detector.specificity.toFixed(3)}</div>
            <div className="mt-1 text-sm font-medium text-gray-700">Specificity</div>
            <div className="text-xs text-gray-500">vs target {detector.target.specificity}</div>
          </div>
        </div>

        {detector.per_class.length > 0 && (
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">Per-class sensitivity</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 font-medium">Class</th>
                    <th className="px-3 py-2 font-medium">Sensitivity</th>
                    <th className="px-3 py-2 font-medium">95% CI</th>
                    <th className="px-3 py-2 font-medium">n</th>
                  </tr>
                </thead>
                <tbody>
                  {detector.per_class.map(row => (
                    <tr key={row.label} className="border-b last:border-0">
                      <td className="px-3 py-2 text-gray-700">{EQUIPOISE_CLASS_LABELS[row.label] || row.label}</td>
                      <td className="px-3 py-2 text-gray-700 font-medium">{row.p.toFixed(3)}</td>
                      <td className="px-3 py-2 text-gray-500">[{row.lo.toFixed(3)}–{row.hi.toFixed(3)}]</td>
                      <td className="px-3 py-2 text-gray-500">{row.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* How we validated — the key differentiator */}
      <div className="rounded-lg border border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-sm shadow-amber-100 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">How we validated</h2>
        <p className="text-sm font-medium text-amber-900 mb-6">
          AequOs appraises evidence — it doesn&apos;t just recognize famous debates.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-amber-200 bg-amber-100/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-2">
              Recognition doesn&apos;t inflate confidence
            </div>
            <p className="text-sm text-gray-700">
              A &quot;recognized controversy&quot; cue does not inflate the panel&apos;s confidence —
              recognition contamination: <span className="font-semibold">{validity.recognition_contamination}</span>
              {' '}({validity.cue_injection.cases_showing_inflation} cases showed inflation).
            </p>
            <p className="text-xs text-gray-500 mt-2">{validity.cue_injection.conclusion}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-100/50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-2">
              Follows the evidence, topic hidden
            </div>
            <p className="text-sm text-gray-700">
              Given only evidence with the topic hidden, the panel defers{' '}
              <span className="font-semibold">{validity.masked_evidence.no_difference_deferral}</span>{' '}
              of the time when told there&apos;s no difference, and follows strong evidence{' '}
              <span className="font-semibold">{validity.masked_evidence.strong_evidence_follow}</span>{' '}
              of the time.
            </p>
            <p className="text-xs text-gray-500 mt-2">{validity.masked_evidence.conclusion}</p>
          </div>
        </div>
      </div>

      {/* Disclaimer footer */}
      <p className="text-center text-xs text-gray-400">{stats.disclaimer}</p>
    </div>
  );
}
