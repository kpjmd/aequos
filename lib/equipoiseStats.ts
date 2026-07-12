// Types + display helpers for the backend's validated equipoise-instrument stats
// endpoints (GET /equipoise/stats, GET /equipoise/stats/admin). The frontend is a
// pure pass-through consumer — these interfaces mirror the backend contract
// exactly and no metric is recomputed client-side.

export interface EquipoisePerClassAccuracy {
  label: string;
  p: number;   // point estimate
  lo: number;  // Wilson 95% CI low
  hi: number;  // Wilson 95% CI high
  n: number;
}

export interface EquipoiseEntropyLiftSummary {
  recall_full: number;
  recall_modal_only: number;
  entropy_adds_lift: boolean;
  modal_only_reaches_target: boolean | null;
}

export interface EquipoiseCueInjection {
  overall_confidence_delta: number;
  gap_of_deltas: number;
  gap_of_deltas_ci: [number, number];
  cases_showing_inflation: string; // pre-formatted, e.g. "0/57" — render verbatim
  conclusion: string;
  batch_id: string;
}

export interface EquipoiseMaskedEvidence {
  confidence_by_grade: Record<string, number>; // keys: low | moderate | high
  no_difference_deferral: string; // pre-formatted, e.g. "100%" — render verbatim
  strong_evidence_follow: string; // pre-formatted, e.g. "75%" — render verbatim
  conclusion: string;
  batch_id: string;
}

export interface EquipoiseConvergence {
  by_model: Array<Record<string, unknown>>;
  benchmark_accuracy: Array<Record<string, unknown>>;
}

export interface EquipoiseCalibrationCoverage {
  fitted: string[];
  degenerate: string[];
  uncalibrated: string[];
  skipped: string[];
}

export interface EquipoiseInstrumentStats {
  anchor_set: {
    version: string;
    total: number;
    active: number;
    by_class: Record<string, number>;    // patient_dependent | evidence_split | equivalent_options | settled
    by_stratum: Record<string, number>;  // editorialized | quietly_contested | n_a
  };
  detector: {
    gate_passed: boolean;
    sensitivity: number;
    specificity: number;
    target: { sensitivity: number; specificity: number };
    per_class: EquipoisePerClassAccuracy[];
    entropy_lift_summary: EquipoiseEntropyLiftSummary | null;
    calibration_status: string;
  };
  validity: {
    recognition_contamination: string;
    appraisal: string;
    cue_injection: EquipoiseCueInjection;
    masked_evidence: EquipoiseMaskedEvidence;
  };
  // Omitted (not null) when DATABASE_URL is unset or the query fails — check
  // with `'convergence' in stats`, not truthiness, to distinguish "no rows"
  // from "no DB".
  convergence?: EquipoiseConvergence;
  disclaimer: string;
  generated_at: string;
}

export interface EquipoiseInstrumentAdminStats extends EquipoiseInstrumentStats {
  operational: {
    model_version: string;
    anchor_set_version: string;
    gate_passed: boolean;
    achieved_sensitivity: number;
    achieved_specificity: number;
    threshold: Record<string, number>;
    calibration_coverage: EquipoiseCalibrationCoverage;
  };
}

export const EQUIPOISE_CLASS_LABELS: Record<string, string> = {
  patient_dependent: 'Patient-dependent',
  evidence_split: 'Evidence-split',
  equivalent_options: 'Equivalent options',
  settled: 'Settled',
};

export const EQUIPOISE_CLASS_COLORS: Record<string, string> = {
  patient_dependent: 'bg-amber-500',
  evidence_split: 'bg-indigo-500',
  equivalent_options: 'bg-teal-500',
  settled: 'bg-slate-400',
};

// Bar-width percentage only — a layout convenience, not a reported metric.
export function classPct(count: number, total: number): number {
  if (!total || total <= 0) return 0;
  return (count / total) * 100;
}
