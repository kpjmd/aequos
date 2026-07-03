'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EquipoiseCard as EquipoiseCardType } from '@/lib/types';
import { useClinicianView } from './clinicianView';
import EvidenceLedger from './EvidenceLedger';
import PanelDiscussion from './PanelDiscussion';

interface EquipoiseCardProps {
  card: EquipoiseCardType;
  // Converged cards render collapsed in a compact list; contested render open.
  defaultOpen?: boolean;
  // Anchor of this card's plan in the single CarePlanSection (null if none).
  carePlanAnchorId?: string | null;
  // True once the persisted (ready) cards have been swapped in — drives the
  // ledger empty-state copy (compiling vs. done-but-empty).
  ledgersReady?: boolean;
}

function scrollToCarePlan(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function confidencePct(conf: number | undefined): string | null {
  if (typeof conf !== 'number' || Number.isNaN(conf)) return null;
  return `${Math.round(conf * 100)}%`;
}

// Human labels for the clinical axes a contested decision flips across.
const CONTESTED_AXIS_LABELS: Record<string, string> = {
  demand_risk: 'Demand vs. risk',
  pathology: 'Pathology',
  fracture_pattern: 'Fracture pattern',
  biological_window: 'Biological window',
};
function axisLabel(axis: string): string {
  return CONTESTED_AXIS_LABELS[axis] || prettifyKey(axis);
}

// Prettify a snake_case key (axis or archetype) into readable text, e.g.
// 'high_demand_low_risk' → 'High demand, low risk'.
function prettifyKey(key: string): string {
  const words = (key || '').replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

export default function EquipoiseCard({ card, defaultOpen = true, carePlanAnchorId, ledgersReady }: EquipoiseCardProps) {
  const { clinicianView } = useClinicianView();
  const [open, setOpen] = useState(defaultOpen);
  const [showDelta, setShowDelta] = useState(false);

  const pending = card.pending === true || card.status === 'pending';
  const contested = card.status === 'contested';
  const split = card.theSplit || [];
  const delta = card.deliberationDelta;
  const contestedBy = card.contestedBy || [];
  const tip = card.whatWouldTipIt;
  const axes = tip?.axes || [];
  const toward = tip?.toward || [];

  // Pending skeleton: the background archetype-flip detector is still running.
  // Show a loading slot (question + options only) — no verdict/split/ledger yet.
  if (pending) {
    return (
      <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white shadow-sm">
        <div className="p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-slate-500" />
              ⚖️ Analyzing…
            </span>
          </div>
          <h4 className="text-base font-semibold text-gray-900">{card.decision.question}</h4>
          <p className="mt-1 text-sm text-gray-600">
            <span className="font-medium text-gray-800">{card.decision.optionA}</span>
            <span className="mx-2 text-gray-400">vs</span>
            <span className="font-medium text-gray-800">{card.decision.optionB}</span>
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
            Weighing the panel across patient types…
          </div>
        </div>
      </div>
    );
  }

  // Verdict-driven styling: golden debate card vs calm trustworthy-negative.
  const shell = contested
    ? 'border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 shadow-amber-100'
    : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white';
  const chip = contested ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900';

  return (
    <div className={`rounded-xl border shadow-sm ${shell}`}>
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${chip}`}>
              {contested ? '⚖️ Genuine equipoise' : '✓ Panel agrees'}
            </span>
          </div>
          <h4 className="text-base font-semibold text-gray-900">{card.decision.question}</h4>
          <p className="mt-1 text-sm text-gray-600">
            <span className="font-medium text-gray-800">{card.decision.optionA}</span>
            <span className="mx-2 text-gray-400">vs</span>
            <span className="font-medium text-gray-800">{card.decision.optionB}</span>
          </p>
        </div>
        <svg
          className={`mt-1 h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {/* The split — where each specialist stands (contested only) */}
              {split.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {split.map((side, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 bg-white/70 p-3">
                      <p className="mb-2 text-sm font-semibold text-gray-900">{side.stance}</p>
                      <ul className="space-y-2">
                        {side.specialists.map((s, j) => (
                          <li key={j} className="text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-800">{s.name}</span>
                              {clinicianView && (
                                <span className="flex items-center gap-1 text-[11px] text-gray-500">
                                  {s.evidenceGrade && s.evidenceGrade !== 'none' && (
                                    <span className="rounded bg-gray-100 px-1 font-semibold">Grade {s.evidenceGrade}</span>
                                  )}
                                  {confidencePct(s.confidence) && <span>{confidencePct(s.confidence)} conf.</span>}
                                </span>
                              )}
                            </div>
                            {s.reasoning && <p className="mt-0.5 text-gray-600">{s.reasoning}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : contested ? (
                // No single-room split on the new archetype-flip cards — the
                // average-patient panel usually agrees; the contest is ACROSS
                // patient types. Surface the axes that flip the decision.
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
                  <p>This decision is contested <span className="font-semibold">across patient types</span>, not within the panel.</p>
                  {contestedBy.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {contestedBy.map((axis, i) => (
                        <span key={i} className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                          {axisLabel(axis)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
                  The panel converged with no dissent — there is no genuine clinical debate on this decision.
                </p>
              )}

              {/* What makes this patient-dependent — archetype-flip mapping.
                  Prefer the new archetype_axis shape; fall back to legacy toward. */}
              {contested && (axes.length > 0 || toward.length > 0) && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-100/50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                    What makes this patient-dependent
                  </p>
                  {axes.length > 0 ? (
                    <div className="mt-1.5 space-y-2.5">
                      {axes.map((axis, i) => (
                        <div key={i}>
                          <p className="text-xs font-semibold text-amber-800">{axisLabel(axis.axis)}</p>
                          <div className="mt-0.5 space-y-0.5">
                            {Object.entries(axis.modalByArchetype || {}).map(([archetype, option], j) => (
                              <div key={j} className="text-sm text-amber-900">
                                <span className="font-medium">{prettifyKey(archetype)}:</span>{' '}
                                {option}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 space-y-1.5">
                      {toward.map((t, i) => (
                        <div key={i} className="text-sm text-amber-900">
                          <span className="font-medium">Toward {t.option}:</span>{' '}
                          {(t.factors || []).join('; ')}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Evidence ledger */}
              <div>
                <h5 className="mt-4 text-sm font-semibold text-gray-900">Evidence</h5>
                <EvidenceLedger entries={card.evidenceLedger} decision={card.decision} emptyContext={card.status} final={ledgersReady} />
              </div>

              {/* Reference to the single shared care-plan section (no duplication) */}
              {carePlanAnchorId && (
                <button
                  onClick={() => scrollToCarePlan(carePlanAnchorId)}
                  className="mt-3 block text-xs font-medium text-medical-primary hover:text-medical-accent"
                >
                  🩹 See care plan ↓
                </button>
              )}

              {/* Per-decision full panel discussion (every lens that took a position) */}
              <PanelDiscussion card={card} />

              {/* Deliberation delta — tucked behind an expander */}
              {delta && delta.changedCount > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowDelta(!showDelta)}
                    className="text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    {showDelta ? '− Hide' : '+ Show'} what changed in deliberation
                  </button>
                  <AnimatePresence initial={false}>
                    {showDelta && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 space-y-2 rounded-lg border border-gray-200 bg-white/70 p-3 text-xs text-gray-600">
                          {(delta.revisions || []).map((r, i) => (
                            <p key={i}>
                              <span className="font-semibold text-gray-800">{r.specialist}</span> moved from{' '}
                              <span className="italic">{r.from}</span> → <span className="italic">{r.to}</span>
                              {r.reason ? ` — ${r.reason}` : ''}
                            </p>
                          ))}
                          <p className="border-t border-gray-100 pt-2">
                            {delta.resolved
                              ? 'The panel converged after deliberation.'
                              : delta.persisted
                              ? 'The disagreement persisted — genuine equipoise held.'
                              : 'Deliberation outcome recorded.'}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
