'use client';

import { EquipoiseCard as EquipoiseCardType } from '@/lib/types';
import { useClinicianView } from './clinicianView';
import EquipoiseCard from './EquipoiseCard';
import CarePlanSection, { buildCarePlanGroups } from './CarePlanSection';

interface EquipoisePanelProps {
  cards: EquipoiseCardType[];
  // True once the persisted (ready) cards with ledgers have been swapped in.
  ledgersReady?: boolean;
}

// Map machine route keys to patient-readable copy.
const ROUTE_REASON_TEXT: Record<string, string> = {
  risk_category: 'A high-risk condition was flagged for urgent in-person evaluation.',
  red_flag: 'Red-flag findings warrant urgent evaluation.',
  absolute_indication: 'A clear surgical indication was identified.',
};
function reasonText(reason?: string | null): string | null {
  if (!reason || reason === 'none') return null;
  return ROUTE_REASON_TEXT[reason] || reason.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

const URGENCY_TEXT: Record<string, string> = {
  immediate: 'Seek care now',
  urgent: 'Urgent',
  'semi-urgent': 'Semi-urgent',
  routine: 'Routine',
};
function urgencyText(level?: string | null): string | null {
  if (!level || level === 'routine') return null;
  return URGENCY_TEXT[level] || level.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

function ClinicianToggle() {
  const { clinicianView, toggle } = useClinicianView();
  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={clinicianView}
      className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:border-gray-300"
    >
      <span className={`h-2 w-2 rounded-full ${clinicianView ? 'bg-medical-primary' : 'bg-gray-300'}`} />
      {clinicianView ? 'Clinician view' : 'Patient view'}
    </button>
  );
}

export default function EquipoisePanel({ cards, ledgersReady }: EquipoisePanelProps) {
  if (!cards || cards.length === 0) return null;

  // Pending skeletons render as loading slots during the background detection
  // stage; once the poll swaps in the real cards, none are pending.
  const isPending = (c: EquipoiseCardType) => c.pending === true || c.status === 'pending';
  const pending = cards.filter(isPending);
  // Contested first; converged collapse into a compact list.
  const contested = cards.filter(c => !isPending(c) && c.status === 'contested');
  const converged = cards.filter(c => !isPending(c) && c.status !== 'contested');

  // Route-to-human: surface the escalation once, at the top.
  const escalation = cards.find(c => c.route?.toHuman)?.route;

  // One care-plan section for the whole consult; cards reference it by anchor.
  const { groups: carePlanGroups, anchorForCard } = buildCarePlanGroups(cards);

  return (
    <div className="space-y-4">
      {escalation && (
        <div className="flex items-start gap-3 rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="font-bold text-red-900">{escalation.label || 'Urgent surgical consult'}</p>
            {reasonText(escalation.reason) && (
              <p className="mt-0.5 text-sm text-red-800">{reasonText(escalation.reason)}</p>
            )}
            {urgencyText(escalation.urgencyLevel) && (
              <span className="mt-1 inline-block rounded bg-red-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-900">
                {urgencyText(escalation.urgencyLevel)}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">
          {contested.length > 0 || pending.length > 0 ? 'Where the decision turns' : 'The panel agrees'}
        </h3>
        <ClinicianToggle />
      </div>

      {pending.map((card, i) => (
        <EquipoiseCard key={`pending-${i}`} card={card} />
      ))}

      {contested.map((card, i) => (
        <EquipoiseCard key={`contested-${i}`} card={card} defaultOpen carePlanAnchorId={anchorForCard(card)} ledgersReady={ledgersReady} />
      ))}

      {converged.length > 0 && (
        <div className="space-y-2">
          {contested.length > 0 && (
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {converged.length} decision{converged.length === 1 ? '' : 's'} the panel converged on
            </p>
          )}
          {converged.map((card, i) => (
            <EquipoiseCard
              key={`converged-${i}`}
              card={card}
              // When converged cards are the only content, open them; when they
              // sit beneath contested stars, keep them collapsed as secondary.
              defaultOpen={contested.length === 0}
              carePlanAnchorId={anchorForCard(card)}
              ledgersReady={ledgersReady}
            />
          ))}
        </div>
      )}

      {/* Single shared care-plan section for the whole consult */}
      <CarePlanSection groups={carePlanGroups} />
    </div>
  );
}
