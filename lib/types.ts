export interface Question {
  id: string;
  fid: string;
  question: string;
  response: string;
  timestamp: Date;
  isFiltered: boolean;
}

export interface RateLimit {
  fid: string;
  count: number;
  lastReset: Date;
}

export interface FrameMessage {
  fid: string;
  text?: string;
  button?: number;
  timestamp: Date;
}

export interface ClaudeResponse {
  response: string;
  isRelevant: boolean;
  confidence: number;
  inquiry?: string;
  keyPoints?: string[];
  // OrthoIQ-Agents integration fields
  dataCompleteness?: number;
  suggestedFollowUp?: string[];
  triageConfidence?: number;
  specialistCoverage?: {
    [specialist: string]: boolean;
  };
  participatingSpecialists?: string[];
  consultationId?: string;
  fromAgentsSystem?: boolean;
  rawConsultationData?: any; // Preserve raw consultation data for specialist extraction
  researchData?: any; // Inline research data returned by agents system alongside consultation
  // Phase 3.1: Two-stage consultation UX
  urgencyLevel?: 'emergency' | 'urgent' | 'semi-urgent' | 'routine';
  // Informational Query Pathway (backend v0.7.0)
  queryType?: 'clinical' | 'informational';
  querySubtype?: string | null;
  // Async polling: set when Railway returned processing state (normal mode fire-and-forget)
  processingAsync?: boolean;
  // Scope validation for out-of-scope queries
  isOutOfScope?: boolean;
  scopeValidation?: {
    category: string;
    message: {
      title: string;
      message: string;
      suggestion: string;
    };
    detectedCondition: string;
    confidence: number;
  };
}


export interface PrescriptionData {
  userQuestion: string;
  claudeResponse: string;
  confidence: number;
  fid: string;
  caseId: string;
  timestamp: string;
  userEmail?: string;
  inquiry?: string;
  keyPoints?: string[];
  enhancedData?: {
    primaryDiagnosis?: string;
    diagnosisConfidence?: number;
    agentConsensus?: number;
    topSpecialistInsights?: Array<{
      specialist: string;
      keyInsight: string;
      confidence: number;
    }>;
    topRecommendations?: Array<{
      intervention: string;
      frequency?: string;
      provider?: string;
    }>;
    evidenceGrade?: string;
  };
}

export interface PrescriptionMetadata {
  id: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'ultra-rare';
  theme: PrescriptionTheme;
  generatedAt: string;
  verificationHash: string;
  patientId: string;
  prescriberId: string;
  watermarkType?: 'none' | 'medical_pattern' | 'gold_caduceus' | 'holographic';
  nftMetadata?: object;
}

export interface PrescriptionTheme {
  primaryColor: string;
  accentColor: string;
  borderStyle: string;
  effects: string[];
  logoVariant: 'blue' | 'teal' | 'monochrome' | 'gold';
}

export interface ParsedResponse {
  chiefComplaint: string;
  assessment: string[];
  recommendations: string[];
  disclaimers: string[];
  inquiry?: string;
  keyPoints?: string[];
}

export interface RarityConfig {
  name: 'common' | 'uncommon' | 'rare' | 'ultra-rare';
  probability: number;
  theme: PrescriptionTheme;
  minConfidence?: number;
}

// Payment system interfaces for MD review
export interface PaymentRequest {
  id: number;
  paymentId: string;
  prescriptionId: string;
  questionId: number;
  fid: string;
  amountUSDC: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  paymentHash?: string;
  walletAddress?: string;
  requestedAt: Date;
  paidAt?: Date;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MDReviewQueue {
  id: number;
  prescriptionId: string;
  paymentId: string;
  fid: string;
  priority: number;
  status: 'pending' | 'in_review' | 'completed' | 'expired';
  assignedToMD?: string;
  reviewNotes?: string;
  mdSignature?: string;
  reviewedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletConnectionState {
  isConnected: boolean;
  address?: string;
  balance?: number;
  isConnecting: boolean;
  error?: string;
}

export interface PaymentModalProps {
  prescriptionId: string;
  questionId: number;
  fid: string;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: (paymentId: string) => void;
  onPaymentError: (error: string) => void;
}

export interface MDReviewUpgradeProps {
  prescriptionId: string;
  questionId: number;
  fid: string;
  isAlreadyPaid: boolean;
  paymentStatus?: string;
  inReviewQueue: boolean;
  isReviewed: boolean;
}

export interface PaymentStatusProps {
  paymentId: string;
  onStatusUpdate: (status: string) => void;
}

// Agent System Types
export interface AgentContext {
  question: string;
  fid: string;
  questionId?: number;
  userTier: 'basic' | 'authenticated' | 'medical' | 'scholar' | 'practitioner' | 'institution';
  metadata?: Record<string, any>;
}

export interface AgentResult {
  success: boolean;
  data?: any;
  error?: string;
  enrichments?: AgentEnrichment[];
  cost?: number; // In Claude API tokens or USDC
}

export interface AgentEnrichment {
  type: 'research' | 'citation' | 'image_analysis' | 'followup';
  title: string;
  content: string;
  metadata?: Record<string, any>;
  nftEligible?: boolean;
  rarityTier?: ResearchRarity;
}

export interface Agent {
  name: string;
  description: string;
  canHandle(context: AgentContext): boolean;
  execute(context: AgentContext): Promise<AgentResult>;
  estimateCost(context: AgentContext): number;
}

export interface AgentTask {
  id: string;
  agentName: string;
  context: AgentContext;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: AgentResult;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
}

// Research System Types
export type ResearchRarity = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface ResearchQuery {
  condition: string;
  bodyParts: string[];
  treatmentType?: string;
  studyTypes?: ('rct' | 'cohort' | 'case-control' | 'systematic-review' | 'meta-analysis')[];
  maxAge?: number; // Papers published within X years
  minSampleSize?: number;
}

export interface ResearchPaper {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  publicationDate: string;
  abstract: string;
  citationCount?: number;
  impactFactor?: number;
  evidenceLevel: 'I' | 'II' | 'III' | 'IV' | 'V';
  fullTextAvailable: boolean;
}

export interface ResearchSynthesis {
  id: string;
  query: ResearchQuery;
  papers: ResearchPaper[];
  synthesis: string;
  keyFindings: string[];
  limitations: string[];
  clinicalRelevance: string;
  evidenceStrength: 'strong' | 'moderate' | 'weak' | 'insufficient';
  generatedAt: Date;
  mdReviewed: boolean;
  mdReviewer?: string;
  mdNotes?: string;
}

export interface ResearchNFTMetadata {
  id: string;
  rarity: ResearchRarity;
  studyCount: number;
  publicationYears: string;
  evidenceLevel: string;
  specialties: string[];
  citationCount: number;
  impactFactor: number;
  clinicalRelevance: number;
  timesViewed: number;
  timesCited: number;
  mdEndorsements: string[];
  researchHash: string;
  createdAt: Date;
  lastUpdated: Date;
}

export interface ResearchSubscription {
  fid: string;
  tier: 'scholar' | 'practitioner' | 'institution';
  bronzeQuota: number;
  silverQuota: number;
  goldQuota: number;
  bronzeUsed: number;
  silverUsed: number;
  goldUsed: number;
  resetDate: Date;
  isActive: boolean;
}

// OrthoIQ-Agents Integration Types
export type ConsultationMode = 'fast' | 'normal';

export interface ConsultationRequest {
  caseData: CaseData;
  requiredSpecialists?: SpecialistType[];
  mode?: ConsultationMode;
}

export type SpecialistType = 'triage' | 'painWhisperer' | 'movementDetective' | 'strengthSage' | 'mindMender';

export interface CaseData {
  // Dual-track data
  rawQuery?: string;
  enableDualTrack?: boolean;
  userId?: string;
  isReturningUser?: boolean;
  priorConsultations?: string[];
  requestResearch?: boolean;
  uploadedImages?: string[];

  // Athlete profile
  athleteProfile?: {
    sport?: string;
    experience?: string;
    weeklyMileage?: number;
  };

  // Platform metadata
  platformContext?: {
    source?: string;
    version?: string;
  };

  // Traditional case data
  primaryComplaint: string;
  symptoms?: string;
  painLevel?: number;
  duration?: string;
  location?: string;
  age?: number;

  // Specialist-specific data
  painData?: {
    location?: string;
    quality?: string;
    triggers?: string[];
    relievers?: string[];
  };
  movementData?: {
    restrictions?: string[];
    patterns?: string[];
  };
  functionalData?: {
    limitations?: string[];
    goals?: string[];
  };
  psychData?: {
    fearAvoidance?: boolean;
    copingStrategies?: string[];
  };

  // Quick flags
  functionalLimitations?: boolean;
  movementDysfunction?: boolean;
  anxietyLevel?: number;
  psychologicalFactors?: boolean;
}

export interface SpecialistAssessment {
  primaryFindings: string[];
  confidence: number;
  dataQuality: number;
  clinicalImportance: 'low' | 'medium' | 'high' | 'critical';
}

export interface StructuredRecommendation {
  intervention: string;
  priority: number;
  evidenceGrade: 'A' | 'B' | 'C';
  contraindications: string[];
  timeline: string;
  expectedOutcome: string;
}

export interface KeyFinding {
  finding: string;
  confidence: number;
  clinicalRelevance: 'low' | 'medium' | 'high';
  requiresMDReview: boolean;
}

export interface InterAgentQuestion {
  targetAgent: string;
  question: string;
  priority: 'low' | 'medium' | 'high';
}

export interface SpecialistResponse {
  specialist: string;
  specialistType: SpecialistType;
  assessment: SpecialistAssessment;
  response: string;
  recommendations: StructuredRecommendation[];
  keyFindings: KeyFinding[];
  questionsForAgents: InterAgentQuestion[];
  followUpQuestions: string[];
  agreementWithTriage: 'full' | 'partial' | 'disagree' | 'self';
  confidence: number;
  responseTime: number;
  timestamp: string;
  status: 'success' | 'failed';
}

export interface TreatmentPhase {
  name: string;
  timeframe: string;
  goals: string[];
  interventions: Array<{
    intervention: string;
    frequency: string;
    provider: string;
  }>;
  progressMarkers: string[];
}

export interface ClinicalFlag {
  flag: string;
  severity: 'routine' | 'semi-urgent' | 'urgent' | 'emergency';
  detectedBy: string;
  recommendedAction: string;
}

export interface ConfidenceFactors {
  dataCompleteness: number;
  interAgentAgreement: number;
  evidenceQuality: number;
  overallConfidence: number;
}

export interface DiagnosisHypothesis {
  primary: string;
  differential: string[];
  confidence: number;
  agentConsensus: number;
}

export interface SpecialistInsight {
  specialist: string;
  keyInsight: string;
  confidence: number;
}

export interface EvidenceBase {
  recommendationStrength: string;
  evidenceGrade: string;
  references: string[];
}

export interface TrackingMetric {
  metric: string;
  baseline: string;
  target: string;
  timeframe: string;
}

export interface PrescriptionDataEnhanced {
  diagnosisHypothesis: DiagnosisHypothesis;
  specialistInsights: SpecialistInsight[];
  evidenceBase: EvidenceBase;
  trackingMetrics: TrackingMetric[];
}

export interface SuggestedFollowUp {
  question: string;
  purpose: string;
  expectedImpact: 'low' | 'medium' | 'high';
  targetedSpecialist: string;
}

export interface FeedbackPrompts {
  immediate: {
    question: string;
    type: string;
  };
  milestones: Array<{
    day: number;
    prompt: string;
    metrics: string[];
  }>;
}

export interface SynthesizedRecommendations {
  synthesis: string;
  treatmentPlan: {
    phase1: TreatmentPhase;
    phase2: TreatmentPhase;
    phase3: TreatmentPhase;
  };
  clinicalFlags: {
    redFlags: ClinicalFlag[];
    requiresImmediateMD: boolean;
    urgencyLevel: string;
    safeToProceed: boolean;
  };
  confidenceFactors: ConfidenceFactors;
  prescriptionData: PrescriptionDataEnhanced;
  suggestedFollowUp: SuggestedFollowUp[];
  feedbackPrompts: FeedbackPrompts;
  // Equipoise-mapping instrument: one card per decision point. Present on the
  // live consult response; rendered as the post-consult hero. See EquipoiseCard.
  equipoiseCards?: EquipoiseCard[];
}

// ---------------------------------------------------------------------------
// Equipoise card (the post-consult hero) — one card_json per decision point.
//
// The panel diverges iff there is genuine clinical equipoise; convergence is a
// product (a trustworthy negative). `status==='contested'` is the golden
// debate card; `status==='consensus'` is the calm trustworthy-negative.
//
// This contract is new and partly derived backend-side — render defensively:
// `whatWouldTipIt` may be absent, and `evidenceLedger` is legitimately empty on
// a settled-operative case (no equipoise-grade evidence exists).
// ---------------------------------------------------------------------------
export interface EquipoiseDecision {
  question: string;
  optionA: string;
  optionB: string;
}

export interface EquipoiseSplitSpecialist {
  name: string;
  confidence: number; // 0–1
  evidenceGrade: EvidenceGrade;
  reasoning: string;
}

export interface EquipoiseSplitStance {
  stance: string;
  specialists: EquipoiseSplitSpecialist[];
}

// Every lens that took a substantive position (incl. deliberate deferrals as
// stance:'abstain'). Present on consensus AND contested cards. `stance` is the
// enum here (option_a/option_b/abstain) — resolve to a label via the decision.
export type EquipoiseStance = 'option_a' | 'option_b' | 'abstain';

export interface EquipoisePanelMember {
  name: string;
  specialistType: string;
  stance: EquipoiseStance;
  confidence: number | null; // 0–1
  evidenceGrade: string | null; // self-grade: 'A'|'B'|'C'|'D'|'none'
  reasoning: string | null;
}

// A single specialist who moved position during dialogue.
export interface EquipoiseRevision {
  specialist: string;
  from: string;
  to: string;
  reason: string;
}

// Who moved in dialogue. `revisions` is the per-specialist move list.
export interface EquipoiseDeliberationDelta {
  revisions: EquipoiseRevision[];
  changedCount: number;
  persisted: boolean;
  resolved: boolean;
}

// Derived (never hallucinated). `toward` lists, per option, the factors that
// would push the decision that way. `source` distinguishes how it was derived.
export interface EquipoiseTipDirection {
  option: string;
  factors: string[];
}
// Archetype-flip axis: a clinical axis whose value flips the favored option
// across patient archetypes. `modalByArchetype` maps an archetype key
// (e.g. 'high_demand_low_risk') to the option that archetype favors.
export interface EquipoiseArchetypeAxis {
  axis: string; // 'demand_risk' | 'pathology' | 'fracture_pattern' | 'biological_window'
  modalByArchetype: Record<string, string>; // archetype key → favored option label
}
export interface EquipoiseWhatWouldTipIt {
  source: 'archetype_axis' | 'panel_reasoning';
  toward?: EquipoiseTipDirection[]; // legacy panel_reasoning shape
  axes?: EquipoiseArchetypeAxis[]; // new archetype_axis shape
  [key: string]: unknown;
}

// Accepted citation. `supportsStance` is a stable key — 'option_a' | 'option_b'
// | 'abstain' — resolved against the decision's optionA/optionB for display.
// `evidenceGrade` here uses a strength vocabulary ('high'|'moderate'|'low'),
// distinct from the A–D grades the panel specialists carry.
export interface EquipoiseEvidenceEntry {
  pmid: string;
  title: string;
  studyType: string;
  evidenceGrade: string;
  populationMatch: string;
  supportsStance: string;
  claimText: string;
  rationale: string;
}

// Route-to-human escalation. `toHuman===true` → "Urgent surgical consult" banner.
export interface EquipoiseRoute {
  toHuman: boolean;
  reason: string;
  urgencyLevel: string;
  label: string | null;
}

// Per-decision care pathway. Phases (phase1..phase3) are the production shape;
// keep it open and render defensively.
export interface EquipoiseCarePlanHome {
  phase1?: string;
  phase2?: string;
  phase3?: string;
  [key: string]: unknown;
}

export interface EquipoiseCard {
  decision: EquipoiseDecision;
  // `null` on a pending skeleton; 'consensus' on a settled archetype-flip card.
  verdict: 'contested' | 'consensus' | 'converged' | null;
  // 'pending' while the background archetype-flip detector is still running.
  status: 'pending' | 'contested' | 'consensus' | 'refer';
  // True on the skeleton the consult response ships before detection completes.
  pending?: boolean;
  contestedBy?: string[] | null;
  // Full panel: every lens that took a position (use for "full panel discussion").
  panel?: EquipoisePanelMember[] | null;
  theSplit: EquipoiseSplitStance[] | null;
  deliberationDelta?: EquipoiseDeliberationDelta | null;
  whatWouldTipIt?: EquipoiseWhatWouldTipIt | null;
  carePlanHome?: EquipoiseCarePlanHome | null;
  evidenceLedger: EquipoiseEvidenceEntry[];
  route?: EquipoiseRoute | null;
}

export interface InterAgentDialogue {
  fromAgent: string;
  toAgent: string;
  question: string;
  response: string;
  impactOnDiagnosis: boolean;
}

export interface Disagreement {
  topic: string;
  agents: string[];
  positions: string[];
  resolution: string;
  severity: 'low' | 'medium' | 'high';
}

export interface EmergentFinding {
  finding: string;
  discoveredBy: string[];
  novelty: 'expected' | 'interesting' | 'unusual';
}

export interface CoordinationMetadata {
  interAgentDialogue: InterAgentDialogue[];
  disagreements: Disagreement[];
  emergentFindings: EmergentFinding[];
}

// ---------------------------------------------------------------------------
// Inter-agent divergences (gated, high-signal panel disagreements)
//
// NOTE: distinct from the legacy `Disagreement`/`CoordinationMetadata` above.
// Divergences carry the richer sides/dialogue/post-dialogue deliberation shape
// written to the `coordination_divergences` table and emitted live on
// result.synthesizedRecommendations.coordinationMetadata.divergences.
//
// The live API shape is nested (decisionPoint{...}, postDialogue{...}) and
// carries bonus fields (decisionPoint.rationale, deferred, belowFloor) that the
// DB table does not persist. Both sources normalize into `DivergenceRecord`:
//   - DB rows           via mapDivergenceRow()        (lib/database.ts)
//   - live API entries  via normalizeLiveDivergence() (lib/divergence.ts)
// ---------------------------------------------------------------------------

export type EvidenceGrade = 'A' | 'B' | 'C' | 'D' | 'none';

export interface DivergenceSideSpecialist {
  specialist: string;
  specialistType: string;
  confidence: number; // 0–1
  evidenceGrade: EvidenceGrade;
  reasoning: string;
}

export interface DivergenceSide {
  stance: string;
  specialists: DivergenceSideSpecialist[];
}

export interface DivergenceDialogueEntry {
  specialist: string;
  specialistType: string;
  originalStance: string;
  revisedStance: string;
  changed: boolean;
  reasoning: string;
  changeReason: string;
  confidence: number; // 0–1
}

export interface DivergenceDelta {
  specialist: string;
  from: string;
  to: string;
  reason: string;
}

export interface DivergencePostDialogue {
  resolved: boolean;
  persisted: boolean;
  distinctFinalStances: string[];
  changedCount: number;
  deltas: DivergenceDelta[];
}

export interface DivergenceDeferred {
  specialist: string;
  specialistType: string;
  reasoning: string;
}

// Canonical record — both DB rows and live-API entries normalize into this.
export interface DivergenceRecord {
  consultationId: string;
  decisionPointId: string;
  decisionQuestion: string;
  decisionOptions: string[];
  persisted: boolean;
  resolved: boolean;
  changedCount: number;
  sides: DivergenceSide[];
  dialogue: DivergenceDialogueEntry[];
  postDialogue: DivergencePostDialogue;
  // present from DB only:
  id?: number;
  createdAt?: Date;
  // present from the live status payload only (rendered when defined):
  decisionRationale?: string;
  deferred?: DivergenceDeferred[];
  belowFloor?: number;
}

// ---------------------------------------------------------------------------
// Lean content projection — the trimmed divergence shape forwarded through the
// external batch content payload (GET /api/v1/consult/[jobId]). Drops reasoning
// prose, dialogue play-by-play, deltas, deferred/belowFloor, and internal IDs;
// keeps only what a content library needs to show who stood where on each
// contested decision. Projected from DivergenceRecord via toContentDivergence()
// (lib/divergence.ts).
// ---------------------------------------------------------------------------
export interface ContentDivergenceSideSpecialist {
  specialist: string; // display name
  specialistType: string; // stable machine key
  evidenceGrade: EvidenceGrade;
  confidence: number; // 0–1
}

export interface ContentDivergenceSide {
  stance: string;
  specialists: ContentDivergenceSideSpecialist[];
}

export interface ContentDivergence {
  decisionQuestion: string;
  options: string[];
  persisted: boolean;
  resolved: boolean;
  changedCount: number;
  sides: ContentDivergenceSide[];
}

export interface NormalModeConsultation {
  responses: Array<{ response: SpecialistResponse }>;
  synthesizedRecommendations: SynthesizedRecommendations;
  coordinationMetadata: CoordinationMetadata;
  participatingSpecialists: string[];
  consultationId: string;
  totalResponseTime: number;
  timestamp: string;
}

export interface FastModeTriageResponse {
  specialist: string;
  specialistType: 'triage';
  assessment: SpecialistAssessment;
  response: string;
  recommendations: StructuredRecommendation[];
  keyFindings: KeyFinding[];
  questionsForAgents: InterAgentQuestion[];
  followUpQuestions: string[];
  urgencyLevel: 'emergency' | 'urgent' | 'semi-urgent' | 'routine';
  specialistRecommendations: string[];
  caseId: string;
  confidence: number;
  responseTime: number;
  timestamp: string;
  status: 'success';
}

export interface ConsultationResponseNormal {
  success: boolean;
  mode: 'normal';
  consultation: NormalModeConsultation;
  dataCompleteness: number;
  suggestedFollowUp: string[];
  triageConfidence: number;
  specialistCoverage: {
    triage: boolean;
    painWhisperer: boolean;
    movementDetective: boolean;
    strengthSage: boolean;
    mindMender: boolean;
  };
  fromCache: boolean;
  responseTime: number;
  timestamp: string;
}

export interface ConsultationResponseFast {
  success: boolean;
  mode: 'fast';
  triage: FastModeTriageResponse;
  status: 'processing';
  message: string;
  consultationId: string;
  responseTime: number;
  timestamp: string;
}

export type ConsultationResponse = ConsultationResponseNormal | ConsultationResponseFast;

// Research Agent Integration Types (Phase 2)
export interface ResearchCitation {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  quality: 'high' | 'moderate' | 'low';
  relevanceScore: number;
  abstract?: string;
  pubmedUrl: string;
}

export interface ResearchResult {
  consultationId: string;
  status: ResearchStatus;
  intro?: string;
  citations: ResearchCitation[];
  totalStudiesFound: number;
  searchTerms: string[];
  completedAt?: string;
  error?: string;
}

export type ResearchStatus = 'idle' | 'pending' | 'complete' | 'failed' | 'not_found';

export interface ResearchState {
  status: ResearchStatus;
  result: ResearchResult | null;
  error: string | null;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface AgentSummaryData {
  specialist: string;
  specialistType: string;
  icon: string;
  summary: string;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  agreementWithTriage: string;
}

export interface StructuredBriefData {
  keyFinding: string;
  immediateAction: string;
  consensusCount: number;
  totalAgents: number;
  overallConfidence: number;
  overallConfidenceLevel: ConfidenceLevel;
  agentSummaries: AgentSummaryData[];
  followUpQuestion: string | null;
  perAgentConfidences: Array<{ specialist: string; confidence: number }>;
}

// Feedback System Types
export interface FeedbackRequest {
  consultationId: string;
  patientId: string;
  feedback: {
    userSatisfaction: number;
    outcomeSuccess: boolean;
    mdReview?: {
      approved: boolean;
      reviewerName: string;
      reviewDate: string;
      specialistAccuracy: {
        pain: number;
        movement: number;
        strength: number;
        mind: number;
      };
    };
    followUpDataProvided?: {
      painReduction: number;
      functionalImprovement: number;
      adherenceRate: number;
      timeToRecovery: number;
    };
  };
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

// ── PROMIS types moved to lib/promisTypes.ts ──