'use client';

import { useEffect, useState } from 'react';
import {
  EquipoiseInstrumentAdminStats,
  EQUIPOISE_CLASS_LABELS,
} from '@/lib/equipoiseStats';

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(3);
  }
  return String(v);
}

function prettyKey(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function GenericTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400 italic">No rows yet.</p>;
  }
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
            {columns.map(c => (
              <th key={c} className="px-3 py-2 font-medium">{prettyKey(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {columns.map(c => (
                <td key={c} className="px-3 py-2 text-gray-700">{fmt(row[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, badge, blurb, children }: { title: string; badge?: string; blurb?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          {badge && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              {badge}
            </span>
          )}
        </div>
        {blurb && <p className="text-sm text-gray-500">{blurb}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export function InstrumentMetrics() {
  const [data, setData] = useState<EquipoiseInstrumentAdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/equipoise-stats');
        if (res.ok && !cancelled) {
          setData(await res.json());
        } else if (!cancelled) {
          setFailed(true);
        }
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
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <p className="text-sm text-gray-400 italic">Equipoise instrument stats unavailable.</p>
      </div>
    );
  }

  const { operational, detector } = data;
  const coverage = operational.calibration_coverage;
  const hasConvergence = 'convergence' in data;

  return (
    <div className="space-y-6">
      <Section
        title="Gate status"
        badge={operational.gate_passed ? '✅ PASS' : '❌ FAIL'}
        blurb={`${operational.model_version} · anchor set ${operational.anchor_set_version} · ${data.generated_at}`}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
            <div className="text-3xl font-bold text-emerald-700">{fmt(operational.achieved_sensitivity)}</div>
            <div className="mt-1 text-sm font-medium text-gray-700">Achieved sensitivity</div>
            <div className="text-xs text-gray-500">vs target {detector.target.sensitivity}</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
            <div className="text-3xl font-bold text-emerald-700">{fmt(operational.achieved_specificity)}</div>
            <div className="mt-1 text-sm font-medium text-gray-700">Achieved specificity</div>
            <div className="text-xs text-gray-500">vs target {detector.target.specificity}</div>
          </div>
        </div>
      </Section>

      <Section title="Calibration coverage" blurb={`Status: ${detector.calibration_status}`}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-700">{coverage.fitted.length}</div>
            <div className="text-xs text-gray-500">Fitted</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-600">{coverage.degenerate.length}</div>
            <div className="text-xs text-gray-500">Degenerate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-400">{coverage.uncalibrated.length}</div>
            <div className="text-xs text-gray-500">Uncalibrated</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-400">{coverage.skipped.length}</div>
            <div className="text-xs text-gray-500">Skipped</div>
          </div>
        </div>
      </Section>

      <Section title="Per-class sensitivity" blurb="Wilson 95% CIs from the anchor-set benchmark.">
        <GenericTable
          rows={detector.per_class.map(row => ({
            class: EQUIPOISE_CLASS_LABELS[row.label] || row.label,
            sensitivity: row.p,
            ci_low: row.lo,
            ci_high: row.hi,
            n: row.n,
          }))}
        />
      </Section>

      <Section title="Convergence" blurb="Live convergence-vs-equipoise distribution from the database.">
        {hasConvergence && data.convergence ? (
          <div className="space-y-6">
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">By model</div>
              <GenericTable rows={data.convergence.by_model} />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Benchmark accuracy</div>
              <GenericTable rows={data.convergence.benchmark_accuracy} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Convergence: no DB in this environment.</p>
        )}
      </Section>
    </div>
  );
}
