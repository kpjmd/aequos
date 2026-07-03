'use client';

import { EquipoiseEvidenceEntry, EquipoiseDecision } from '@/lib/types';
import { useClinicianView } from './clinicianView';

interface EvidenceLedgerProps {
  entries: EquipoiseEvidenceEntry[];
  decision: EquipoiseDecision;
  // Drives the empty-state copy: an empty ledger on a settled (consensus) case
  // is CORRECT — no equipoise-grade evidence exists — not an error.
  emptyContext?: 'pending' | 'contested' | 'consensus' | 'refer';
  // True once the persisted (ready) card has been swapped in. Distinguishes a
  // ledger still compiling (skeleton) from one the backend finished with empty.
  final?: boolean;
}

// Grade vocab is mixed: ledger entries use strength words, panel specialists use
// A–D. Style either.
function gradeStyle(grade: string): string {
  const g = (grade || '').toLowerCase();
  if (g === 'high' || g === 'a') return 'bg-green-100 text-green-800 border-green-200';
  if (g === 'moderate' || g === 'b') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (g === 'low' || g === 'c') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (g === 'd') return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-gray-100 text-gray-600 border-gray-200';
}

function populationStyle(match: string): string {
  const m = (match || '').toLowerCase();
  if (m.includes('exact') || m.includes('direct') || m === 'match') {
    return 'bg-green-50 text-green-700 border-green-200';
  }
  if (m.includes('mismatch') || m.includes('poor') || m.includes('indirect') || m === 'none') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  return 'bg-gray-50 text-gray-600 border-gray-200';
}

// Resolve the stable stance key to a human label and a sort rank.
function resolveStance(key: string, decision: EquipoiseDecision): { label: string; rank: number } {
  switch ((key || '').toLowerCase()) {
    case 'option_a':
      return { label: `Supports: ${decision.optionA}`, rank: 0 };
    case 'option_b':
      return { label: `Supports: ${decision.optionB}`, rank: 1 };
    case 'abstain':
      return { label: 'Background (does not pick a side)', rank: 2 };
    default:
      return { label: key || 'Unattributed', rank: 3 };
  }
}

export default function EvidenceLedger({ entries, decision, emptyContext, final }: EvidenceLedgerProps) {
  const { clinicianView } = useClinicianView();

  if (!entries || entries.length === 0) {
    const settled = emptyContext === 'consensus';
    // Three distinct empty states: still compiling (not final), settled-operative
    // (final + consensus, correct), and no accepted evidence (final + contested).
    let heading: string;
    let body: string;
    if (!final) {
      heading = 'Evidence is still being compiled…';
      body = 'The accepted citations for this decision will appear here once the ledger finishes compiling.';
    } else if (settled) {
      heading = 'No equipoise-grade evidence — and that is the point.';
      body = 'This is a settled operative indication: there is no genuine clinical debate for studies to weigh in on.';
    } else {
      heading = 'No equipoise-grade citations were accepted for this decision.';
      body = 'The panel did not accept any citation that meets the bar for this contested decision.';
    }
    return (
      <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-700">{heading}</p>
        <p className="mt-1">{body}</p>
      </div>
    );
  }

  // Group accepted citations by the stance they support, then order the groups.
  const groups = new Map<string, EquipoiseEvidenceEntry[]>();
  for (const e of entries) {
    const key = e.supportsStance || 'abstain';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  const ordered = Array.from(groups.entries())
    .map(([key, items]) => ({ key, items, ...resolveStance(key, decision) }))
    .sort((a, b) => a.rank - b.rank);

  return (
    <div className="mt-3 space-y-4">
      {ordered.map(({ key, items, label }) => (
        <div key={key}>
          <h6 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</h6>
          <ul className="space-y-2">
            {items.map((e, i) => (
              <li key={`${e.pmid}-${i}`} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900">{e.title}</p>
                  {clinicianView && e.evidenceGrade && (
                    <span className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${gradeStyle(e.evidenceGrade)}`}>
                      {e.evidenceGrade}
                    </span>
                  )}
                </div>

                {e.claimText && <p className="mt-1 text-sm text-gray-700">{e.claimText}</p>}

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  {e.studyType && (
                    <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-gray-600">
                      {e.studyType.replace(/_/g, ' ')}
                    </span>
                  )}
                  {clinicianView && e.populationMatch && (
                    <span className={`rounded border px-1.5 py-0.5 ${populationStyle(e.populationMatch)}`}>
                      Population: {e.populationMatch}
                    </span>
                  )}
                  {e.pmid && (
                    <a
                      href={`https://pubmed.ncbi.nlm.nih.gov/${e.pmid}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-medical-primary hover:text-medical-accent hover:underline"
                    >
                      PubMed{clinicianView ? ` ${e.pmid}` : ''} ↗
                    </a>
                  )}
                </div>

                {clinicianView && e.rationale && (
                  <p className="mt-2 border-t border-gray-100 pt-2 text-xs italic text-gray-500">{e.rationale}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
