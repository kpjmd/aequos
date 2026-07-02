'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useWebAuth } from './WebAuthProvider';
import ResponseCard from './ResponseCard';
import ActionMenu from './ActionMenu';
import PrescriptionModal from './PrescriptionModal';
import AequOsLogo from './AequOsLogo';
import WebToMiniAppCTA from './WebToMiniAppCTA';
import AgentLoadingCards from './AgentLoadingCards';
import FeedbackModal from './FeedbackModal';
import TriageResponseCard from './TriageResponseCard';
import ComprehensiveLoadingState from './ComprehensiveLoadingState';
import ConsultationChatbot from './ConsultationChatbot';
import { getWebSessionUsage, generateSessionId } from '@/lib/webTracking';
import { useResearchPolling } from '@/hooks/useResearchPolling';
import ResearchStatusRow from '@/components/ResearchStatusRow';
import ResearchDetailPanel from '@/components/ResearchDetailPanel';
import { normalizeResearchResponse } from '@/lib/researchService';
import PROMISQuestionnaire from './PROMISQuestionnaire';
import { isPainRelatedConsultation } from '@/lib/promis';
import { PROMISCompletionResult } from '@/lib/promisTypes';
import { DivergenceRecord } from '@/lib/types';

type ConsultationStage =
  | 'idle'
  | 'triage_loading'
  | 'triage_complete'
  | 'comprehensive_loading'
  | 'comprehensive_complete'
  | 'exited';

interface WebOrthoInterfaceProps {
  className?: string;
}

interface ResponseData {
  response: string;
  confidence?: number;
  isFiltered?: boolean;
  isPendingReview?: boolean;
  isApproved?: boolean;
  reviewedBy?: string;
  reviewType?: string;
  hasAdditions?: boolean;
  hasCorrections?: boolean;
  additionsText?: string;
  correctionsText?: string;
  inquiry?: string;
  keyPoints?: string[];
  questionId?: number;
  enrichments?: any[];
  hasResearch?: boolean;
  userTier?: string;
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
  // Agent coordination fields
  specialistConsultation?: {
    consultationId: string;
    participatingSpecialists: string[];
    coordinationSummary: string;
    specialistCount: number;
  };
  agentBadges?: Array<{
    name: string;
    type: string;
    active: boolean;
    specialty: string;
  }>;
  hasSpecialistConsultation?: boolean;
  agentRouting?: {
    selectedAgent: string;
    routingReason: string;
    alternativeAgents: string[];
    networkExecuted: boolean;
  };
  agentPerformance?: {
    executionTime: number;
    successRate: number;
    averageExecutionTime: number;
    totalExecutions: number;
    specialistCount: number;
  };
  agentNetwork?: {
    activeAgents: number;
    totalCapacity: number;
    currentLoad: number;
    networkUtilization: number;
  };
  // Raw consultation data for enhanced prescription
  rawConsultationData?: any;
  // Inline research data from agents system
  researchData?: any;
  // Phase 3.1: urgency level from triage
  urgencyLevel?: 'emergency' | 'urgent' | 'semi-urgent' | 'routine';
  // Informational Query Pathway
  queryType?: 'clinical' | 'informational';
  querySubtype?: string | null;
  // Inter-agent divergences (panel deliberation play-by-play)
  divergences?: DivergenceRecord[];
}

// Helper function to format structured response objects into readable text
const formatStructuredResponse = (obj: any): string => {
  if (typeof obj === 'string') return obj;

  if (obj && typeof obj === 'object') {
    const sections = [];

    if (obj.diagnosis) {
      sections.push(`**Diagnosis:**\n${obj.diagnosis}`);
    }
    if (obj.immediate_actions) {
      sections.push(`**Immediate Actions:**\n${obj.immediate_actions}`);
    }
    if (obj.red_flags) {
      sections.push(`**Red Flags:**\n${obj.red_flags}`);
    }
    if (obj.specialist_recommendation) {
      sections.push(`**Specialist Recommendation:**\n${obj.specialist_recommendation}`);
    }
    if (obj.followup) {
      sections.push(`**Follow-up:**\n${obj.followup}`);
    }
    if (sections.length > 0) {
      return sections.join('\n\n');
    }
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return '[Complex response object - please check console for details]';
    }
  }

  return obj != null ? String(obj) : '';
};

// Extract and format API response data into ResponseData
const parseApiResponse = (data: any): ResponseData => {
  let formattedResponse = data.response;

  try {
    if (typeof data.response === 'string' && (data.response.trim().startsWith('{') || data.response.trim().startsWith('['))) {
      const parsed = JSON.parse(data.response);
      if (parsed.response) {
        formattedResponse = formatStructuredResponse(parsed.response);
      } else if (typeof parsed === 'string') {
        formattedResponse = parsed;
      } else if (parsed && typeof parsed === 'object') {
        formattedResponse = formatStructuredResponse(parsed);
      }
    } else if (typeof data.response === 'object' && data.response !== null) {
      formattedResponse = formatStructuredResponse(data.response);
    }
  } catch (parseError) {
    console.warn('WebOrthoInterface: JSON parsing failed:', parseError);
    if (typeof data.response === 'string' && data.response.includes('"response"')) {
      try {
        const jsonMatch = data.response.match(/"response"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
        if (jsonMatch && jsonMatch[1]) {
          formattedResponse = jsonMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
        }
      } catch {
        // ignore
      }
    }
  }

  if (typeof formattedResponse !== 'string') {
    formattedResponse = formatStructuredResponse(formattedResponse);
  }
  if (typeof formattedResponse !== 'string') {
    formattedResponse = 'An error occurred while formatting the response. Please try again.';
  }

  return {
    response: formattedResponse,
    confidence: data.confidence,
    isFiltered: data.isFiltered,
    isPendingReview: data.isPendingReview,
    isApproved: data.isApproved,
    reviewedBy: data.reviewedBy,
    reviewType: data.reviewType,
    hasAdditions: data.hasAdditions,
    hasCorrections: data.hasCorrections,
    additionsText: data.additionsText,
    correctionsText: data.correctionsText,
    inquiry: data.inquiry,
    keyPoints: data.keyPoints,
    questionId: data.questionId,
    enrichments: data.enrichments || [],
    hasResearch: data.hasResearch || false,
    userTier: data.userTier || 'basic',
    dataCompleteness: data.dataCompleteness,
    suggestedFollowUp: data.suggestedFollowUp,
    triageConfidence: data.triageConfidence,
    specialistCoverage: data.specialistCoverage,
    participatingSpecialists: data.participatingSpecialists,
    consultationId: data.consultationId,
    fromAgentsSystem: data.fromAgentsSystem,
    specialistConsultation: data.specialistConsultation,
    agentBadges: data.agentBadges || [],
    hasSpecialistConsultation: data.hasSpecialistConsultation || false,
    agentRouting: data.agentRouting,
    agentPerformance: data.agentPerformance,
    agentNetwork: data.agentNetwork,
    rawConsultationData: data.rawConsultationData,
    researchData: data.researchData || null,
    urgencyLevel: data.urgencyLevel,
    queryType: data.queryType || 'clinical',
    querySubtype: data.querySubtype || null,
    divergences: data.divergences || [],
  };
};

export default function WebOrthoInterface({ className = "" }: WebOrthoInterfaceProps) {
  const { user, isAuthenticated, isVerified, signOut, upgradeToEmail, isLoading: authLoading, magicLinkSent } = useWebAuth();

  const { address, isConnected: isWalletConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  // fid is a session identifier — never use wallet address here (it fails FID format validation)
  // The wallet address is sent separately as walletAddress for rate-limit bypass
  const effectiveUserId = user?.id || 'web-guest';
  const effectiveTier = isWalletConnected ? 'authenticated' : (user?.authType === 'email' ? 'medical' : 'basic');

  const [question, setQuestion] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');

  // Consultation stage machine
  const [consultationStage, setConsultationStage] = useState<ConsultationStage>('idle');
  const [triageResult, setTriageResult] = useState<ResponseData | null>(null);
  const [comprehensiveResult, setComprehensiveResult] = useState<ResponseData | null>(null);

  // Derived loading state
  const isLoading = consultationStage === 'triage_loading' || consultationStage === 'comprehensive_loading';

  const [error, setError] = useState('');
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  // Limits: 1 for unauthenticated/guest, 10 for verified email users
  const [dailyQuestions, setDailyQuestions] = useState({ used: 0, limit: 1 });
  const [showUpgradeForm, setShowUpgradeForm] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradeError, setUpgradeError] = useState('');
  const [upgradeSentEmail, setUpgradeSentEmail] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  // PROMIS questionnaire state
  const [showPromisButton, setShowPromisButton] = useState(false);
  const [showPromisQuestionnaire, setShowPromisQuestionnaire] = useState(false);
  // true when questionnaire was started during comprehensive_loading (needs stable shared block)
  const [promisStartedDuringLoading, setPromisStartedDuringLoading] = useState(false);
  const [promisCompleted, setPromisCompleted] = useState(false);
  const [promisResult, setPromisResult] = useState<PROMISCompletionResult | null>(null);
  // For comprehensive path: hold results silently until questionnaire completes
  const [pendingComprehensiveReveal, setPendingComprehensiveReveal] = useState(false);
  // Triage-exit PROMIS state
  const [showTriagePromis, setShowTriagePromis] = useState(false);
  const [triagePromisCompleted, setTriagePromisCompleted] = useState(false);
  const [promisPermaDismissed, setPromisPermaDismissed] = useState(false);

  // Informational Query Pathway state
  const [queryType, setQueryType] = useState<'clinical' | 'informational'>('clinical');
  const [querySubtype, setQuerySubtype] = useState<string | null>(null);

  // User-declared query type override (null = auto-detect)
  const [userQueryType, setUserQueryType] = useState<'clinical' | 'informational' | null>(null);

  // Scope validation for out-of-scope queries
  const [scopeValidationData, setScopeValidationData] = useState<{
    category: string;
    message: {
      title: string;
      message: string;
      suggestion: string;
    };
    detectedCondition: string;
    confidence: number;
  } | null>(null);

  // Web tracking state
  const [webUsage, setWebUsage] = useState({ questionsAsked: 0, questionsRemaining: 1, isLimitReached: false });
  const [showCTA, setShowCTA] = useState(false);
  const [ctaDismissed, setCTADismissed] = useState(false);

  // Detect whether inline research has actual completed citations (not just a trigger stub like { status: 'pending', pollEndpoint })
  const inlineResearch = comprehensiveResult?.researchData;
  const hasCompletedInlineResearch = !!(inlineResearch && (
    inlineResearch.citations?.length > 0 ||
    inlineResearch.research?.citations?.length > 0
  ));

  // Memoize caseData to prevent new object references on every render,
  // which would cause the useResearchPolling abort ref race condition.
  // Pass full structured fields so the backend can build precise PubMed queries.
  const researchCaseData = useMemo(() => {
    const raw = comprehensiveResult?.rawConsultationData || (queryType === 'informational' ? triageResult?.rawConsultationData : undefined);
    const cd = raw?.caseData;
    if (cd) {
      return {
        primaryComplaint: cd.primaryComplaint || '',
        symptoms: cd.symptoms,
        duration: cd.duration,
        location: cd.location,
        painLevel: cd.painLevel,
        age: cd.age,
        rawQuery: cd.rawQuery,
      };
    }
    // Informational queries may not have structured caseData — use the question text
    if (queryType === 'informational' && currentQuestion) {
      return { primaryComplaint: currentQuestion, rawQuery: currentQuestion };
    }
    return undefined;
  }, [comprehensiveResult?.rawConsultationData, triageResult?.rawConsultationData, queryType, currentQuestion]);
  const researchConsultationResult = comprehensiveResult?.rawConsultationData;

  // Research Agent polling — disabled only when inline research already has real citations
  // For informational queries, polling starts at triage_complete (no comprehensive stage)
  const researchPolling = useResearchPolling({
    enabled: !!(
      (consultationStage === 'comprehensive_complete' && comprehensiveResult?.consultationId && !hasCompletedInlineResearch) ||
      (
        (consultationStage === 'triage_complete' || consultationStage === 'exited') &&
        queryType === 'informational' &&
        triageResult?.consultationId
      )
    ),
    consultationId: comprehensiveResult?.consultationId || (queryType === 'informational' ? triageResult?.consultationId : undefined),
    caseData: researchCaseData,
    consultationResult: researchConsultationResult || (queryType === 'informational' ? triageResult?.rawConsultationData : undefined),
    userTier: comprehensiveResult?.userTier || triageResult?.userTier,
  });

  // Use inline research only when it has real citations; otherwise fall back to polling
  const effectiveResearchState = hasCompletedInlineResearch
    ? {
        status: 'complete' as const,
        result: normalizeResearchResponse(inlineResearch, comprehensiveResult?.consultationId || ''),
        error: null,
      }
    : researchPolling.researchState;

  // Fetch web usage from API
  const fetchWebUsage = useCallback(async () => {
    if (isWalletConnected) {
      setWebUsage({ questionsAsked: 0, questionsRemaining: 9999, isLimitReached: false });
      return;
    }
    try {
      const usage = await getWebSessionUsage(isVerified);
      setWebUsage(usage);

      if (usage.questionsAsked >= 1 && !usage.isLimitReached && !ctaDismissed) {
        setShowCTA(true);
      }
      if (usage.isLimitReached) {
        setShowCTA(true);
      }
    } catch (error) {
      console.error('Failed to fetch web usage:', error);
    }
  }, [isVerified, ctaDismissed, isWalletConnected]);

  useEffect(() => {
    generateSessionId();
    fetchWebUsage();
  }, [isVerified, fetchWebUsage]);

  useEffect(() => {
    if (isWalletConnected) {
      setWebUsage({ questionsAsked: 0, questionsRemaining: 9999, isLimitReached: false });
      return;
    }
    const limit = isVerified ? 10 : 1;
    setDailyQuestions(prev => ({ ...prev, limit }));
    setWebUsage(prev => ({
      ...prev,
      questionsRemaining: Math.max(0, limit - prev.questionsAsked),
      isLimitReached: prev.questionsAsked >= limit
    }));
  }, [isVerified, isWalletConnected]);

  const handlePromisDismiss = (consultationId: string) => {
    setPromisPermaDismissed(true);
    setShowPromisButton(false);
    setShowTriagePromis(false);
    if (!consultationId) return;
    fetch(`/api/consultations/${consultationId}/query-type`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fid: user?.id || 'web-guest', queryType: 'informational' }),
    }).catch(() => {});
  };

  // Show PROMIS button after 5s during comprehensive loading (not for informational queries)
  useEffect(() => {
    if (consultationStage === 'comprehensive_loading' && !promisCompleted && queryType !== 'informational') {
      const timer = setTimeout(() => setShowPromisButton(true), 5000);
      return () => clearTimeout(timer);
    }
    if (consultationStage !== 'comprehensive_loading' && consultationStage !== 'comprehensive_complete') {
      setShowPromisButton(false);
    }
  }, [consultationStage, promisCompleted, queryType]);

  // Stage 1: Triage submit
  const handleTriageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    if (!isWalletConnected && webUsage.isLimitReached) {
      const limit = isVerified ? 10 : 1;
      setError(`You've reached your ${limit}-question daily limit. ${isVerified ? 'Try again tomorrow!' : 'Verify your email for 10 questions/day or use our Farcaster Mini App for unlimited access!'}`);
      setShowCTA(true);
      return;
    }

    setConsultationStage('triage_loading');
    setError('');
    setTriageResult(null);
    setComprehensiveResult(null);
    setScopeValidationData(null);
    setCurrentQuestion(question.trim());

    try {
      const sessionId = generateSessionId();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          fid: effectiveUserId,
          tier: effectiveTier,
          isWebUser: true,
          webUser: user,
          mode: 'fast',
          platform: 'web',
          webSessionId: sessionId,
          ...(address && { walletAddress: address }),
          ...(userQueryType && { queryType: userQueryType }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type');

      if (!res.ok) {
        let errorMessage = `API error (${res.status})`;
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await res.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            const errorText = await res.text();
            errorMessage = errorText || errorMessage;
          }
        } else {
          const errorText = await res.text();
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();

      if (data.isOutOfScope && data.scopeValidation) {
        setScopeValidationData(data.scopeValidation);
        setQuestion('');
        setConsultationStage('idle');
        return;
      }

      // Handle soft rate-limit block (HTTP 200 with rateLimited flag)
      if (data.rateLimited) {
        setError(data.softWarning || data.upgradePrompt || 'Rate limit reached. Please try again later.');
        if (data.upgradePrompt) setShowCTA(true);
        setConsultationStage('idle');
        return;
      }

      const result = parseApiResponse(data);
      setTriageResult(result);
      setQueryType(result.queryType === 'informational' ? 'informational' : 'clinical');
      setQuerySubtype(result.querySubtype || null);
      setConsultationStage('triage_complete');
      setQuestion('');

      // Count the question only once (not again for comprehensive upgrade)
      setDailyQuestions(prev => ({ ...prev, used: prev.used + 1 }));
      await fetchWebUsage();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setConsultationStage('idle');
    }
  };

  // Stage 2: Comprehensive upgrade
  // Poll /api/claude/status/:id every 4s until completed or error
  const pollConsultationStatus = async (consultationId: string, maxWaitMs = 150000): Promise<any> => {
    const POLL_INTERVAL = 4000;
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      const res = await fetch(`/api/claude/status/${consultationId}`);
      const data = await res.json();
      if (data.status === 'completed') return data;
      if (data.status === 'error') throw new Error(data.error || 'Consultation failed');
      if (data.status === 'not_found') throw new Error('Consultation not found — please try again');
      // status === 'processing' → continue polling
    }
    throw new Error('Consultation timed out. Please try again.');
  };

  const handleComprehensiveUpgrade = async () => {
    if (consultationStage === 'comprehensive_loading' ||
        consultationStage === 'comprehensive_complete') return;
    setConsultationStage('comprehensive_loading');
    setError('');

    try {
      let data: any;

      // Fast-mode already fired a background comprehensive — reuse it.
      // Polling the existing consultationId avoids a second concurrent coordination.
      if (triageResult?.fromAgentsSystem && triageResult?.consultationId &&
          !triageResult.consultationId.startsWith('fallback-')) {
        data = await pollConsultationStatus(triageResult.consultationId);
      } else {
        // Non-agents path (Claude fallback) or cache hit — fresh POST
        const sessionId = generateSessionId();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // short timeout — Railway replies quickly now

        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: currentQuestion,
            fid: effectiveUserId,
            tier: effectiveTier,
            isWebUser: true,
            webUser: user,
            mode: 'normal',
            platform: 'web',
            webSessionId: sessionId,
            ...(address && { walletAddress: address }),
            ...(userQueryType && { queryType: userQueryType }),
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const contentType = res.headers.get('content-type');

        if (!res.ok) {
          let errorMessage = `API error (${res.status})`;
          if (contentType && contentType.includes('application/json')) {
            try {
              const errorData = await res.json();
              errorMessage = errorData.error || errorMessage;
            } catch {
              const errorText = await res.text();
              errorMessage = errorText || errorMessage;
            }
          } else {
            const errorText = await res.text();
            errorMessage = errorText || errorMessage;
          }
          // Fall back to triage_complete on error
          setError(errorMessage);
          setConsultationStage('triage_complete');
          return;
        }

        const initial = await res.json();

        // Handle soft rate-limit block (HTTP 200 with rateLimited flag)
        if (initial.rateLimited) {
          setError(initial.softWarning || initial.upgradePrompt || 'Rate limit reached. Please try again later.');
          setConsultationStage('triage_complete');
          return;
        }

        if (initial.status === 'processing' && initial.consultationId) {
          // Background processing — poll until complete
          data = await pollConsultationStatus(initial.consultationId);
        } else {
          // Synchronous response (cache hit or legacy path)
          data = initial;
        }
      }

      const result = parseApiResponse(data);
      setComprehensiveResult(result);
      // If user is mid-questionnaire, hold the reveal
      if (showPromisQuestionnaire && !promisCompleted) {
        setPendingComprehensiveReveal(true);
      }
      setConsultationStage('comprehensive_complete');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setConsultationStage('triage_complete');
    }
  };

  // Exit from triage without comprehensive
  const handleTriageExit = () => {
    setConsultationStage('exited');
    setShowFeedbackModal(true);
  };

  const handleAskAnother = () => {
    setConsultationStage('idle');
    setTriageResult(null);
    setComprehensiveResult(null);
    setScopeValidationData(null);
    setError('');
    setShowFeedbackModal(false);
    setShowPromisButton(false);
    setShowPromisQuestionnaire(false);
    setPromisStartedDuringLoading(false);
    setPromisCompleted(false);
    setPromisResult(null);
    setPendingComprehensiveReveal(false);
    setShowTriagePromis(false);
    setTriagePromisCompleted(false);
    setQueryType('clinical');
    setQuerySubtype(null);
    setUserQueryType(null);
    document.getElementById('web-question')?.focus();
  };

  const handleUpgradeToEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgradeEmail.trim()) return;

    try {
      setUpgradeError('');
      const result = await upgradeToEmail(upgradeEmail);
      if (result.success) {
        setUpgradeSentEmail(upgradeEmail);
      } else {
        setUpgradeError(result.message);
      }
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : 'Upgrade failed');
    }
  };

  const handleCloseUpgradeForm = () => {
    setShowUpgradeForm(false);
    setUpgradeEmail('');
    setUpgradeError('');
    setUpgradeSentEmail('');
  };

  const getRemainingQuestions = () => {
    if (isWalletConnected) return 9999;
    return Math.max(0, dailyQuestions.limit - dailyQuestions.used);
  };

  return (
    <div className={`bg-white rounded-lg shadow-lg border ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-900 to-blue-600 text-white p-6 rounded-t-lg">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <AequOsLogo size="medium" variant="blue" />
            <h2 className="text-3xl font-bold">AequOs</h2>
          </div>
          <p className="text-lg opacity-90">Web Experience</p>
          <p className="text-sm mt-2 opacity-75">by Dr. KPJMD</p>

          {(isAuthenticated && user || isWalletConnected) && (
            <div className="mt-3">
              {isWalletConnected ? (
                <p className="text-xs opacity-60">Unlimited access · Wallet connected</p>
              ) : (
                <p className="text-xs opacity-60">
                  Welcome, {user!.name}! Questions remaining today: {webUsage.questionsRemaining} of {dailyQuestions.limit}
                </p>
              )}
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-800 bg-opacity-50">
                  {isWalletConnected ? '🔗 Wallet' : user?.authType === 'email' ? '✉️ Email User' : '👤 Guest User'}
                </div>
                {user?.authType === 'guest' && !isWalletConnected && (
                  <button
                    onClick={() => setShowUpgradeForm(true)}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-full transition-colors"
                  >
                    Add Email
                  </button>
                )}
                {!isWalletConnected ? (
                  <button
                    type="button"
                    onClick={() => connect({ connector: connectors[0] })}
                    disabled={isConnecting}
                    className="text-xs bg-blue-500 hover:bg-blue-400 text-white px-2 py-1 rounded-full transition-colors disabled:opacity-60"
                  >
                    {isConnecting ? 'Connecting…' : 'Connect Wallet'}
                  </button>
                ) : (
                  <span className="text-xs text-blue-200">
                    {address?.slice(0, 6)}…{address?.slice(-4)}
                    {' · '}
                    <button
                      type="button"
                      onClick={() => disconnect()}
                      className="underline hover:text-white"
                    >
                      Disconnect
                    </button>
                  </span>
                )}
                <button
                  onClick={signOut}
                  className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded-full transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Web Conversion CTA */}
        {showCTA && (
          <WebToMiniAppCTA
            questionsRemaining={webUsage.questionsRemaining}
            isHardLimit={webUsage.isLimitReached}
            totalLimit={isVerified ? 10 : 1}
            onDismiss={!webUsage.isLimitReached ? () => {
              setShowCTA(false);
              setCTADismissed(true);
            } : undefined}
          />
        )}

        {/* Question Guidance */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-semibold text-blue-900 mb-2">💡 For best specialist recommendations, include:</p>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Your age (e.g., &quot;35 years old&quot;)</li>
            <li>• Pain level from 1-10</li>
            <li>• Activity level (sedentary/moderate/active/athlete)</li>
            <li>• How long you&apos;ve had symptoms</li>
            <li>• What triggers or relieves symptoms</li>
          </ul>

          <p className="text-sm font-semibold text-blue-900 mt-3 mb-2">Example questions:</p>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setQuestion("28yo athlete with severe ankle pain (8/10) after basketball, swelling for 3 days")}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline text-left block"
            >
              &quot;28yo athlete with severe ankle pain (8/10) after basketball, swelling for 3 days&quot;
            </button>
            <button
              type="button"
              onClick={() => setQuestion("55 year old with moderate knee pain (5/10) when climbing stairs, ongoing for 2 months")}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline text-left block"
            >
              &quot;55 year old with moderate knee pain (5/10) when climbing stairs, ongoing for 2 months&quot;
            </button>
            <button
              type="button"
              onClick={() => setQuestion("17yo with shoulder dislocation during football, needs surgery assessment")}
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline text-left block"
            >
              &quot;17yo with shoulder dislocation during football, needs surgery assessment&quot;
            </button>
          </div>
        </div>

        {/* Expandable Tips Section */}
        <details className="mb-4 group">
          <summary className="p-3 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg cursor-pointer list-none flex items-center justify-between hover:from-purple-100 hover:to-indigo-100 transition-colors">
            <div className="flex items-center space-x-2">
              <span className="text-lg">🧠</span>
              <span className="text-sm font-semibold text-purple-900">Tips for Better Results</span>
              <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">Advanced</span>
            </div>
            <svg className="w-5 h-5 text-purple-500 transform group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </summary>

          <div className="mt-2 p-4 bg-white border border-purple-200 rounded-lg space-y-4">
            {/* Mind Mender Triggers */}
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-lg">🧠</span>
                <h4 className="font-semibold text-red-900 text-sm">Mind Mender Specialist</h4>
              </div>
              <p className="text-xs text-red-700 mb-2">For psychological aspects of recovery. Mention keywords like:</p>
              <div className="flex flex-wrap gap-1">
                {['anxious', 'worried', 'scared', 'nervous', 'depressed', 'chronic pain', 'months of pain', "can't sleep", 'previous injury', 're-injury fear', 'return to sport', 'athlete', 'competition anxiety', 'post-surgery', 'after surgery'].map(keyword => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => setQuestion(prev => prev ? `${prev}, ${keyword}` : keyword)}
                    className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full hover:bg-red-200 transition-colors"
                  >
                    {keyword}
                  </button>
                ))}
              </div>
            </div>

            {/* Other Specialists */}
            <div className="grid md:grid-cols-2 gap-3">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span>💫</span>
                  <h4 className="font-semibold text-purple-900 text-xs">Pain Whisperer</h4>
                </div>
                <p className="text-xs text-purple-700">Analyzes pain patterns, radiating pain, numbness, tingling, triggers</p>
              </div>

              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span>🔍</span>
                  <h4 className="font-semibold text-green-900 text-xs">Movement Detective</h4>
                </div>
                <p className="text-xs text-green-700">Analyzes biomechanics, movement patterns, posture, gait issues</p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span>💪</span>
                  <h4 className="font-semibold text-amber-900 text-xs">Strength Sage</h4>
                </div>
                <p className="text-xs text-amber-700">Plans rehabilitation, functional restoration, strength building</p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <span>🏥</span>
                  <h4 className="font-semibold text-blue-900 text-xs">OrthoTriage Master</h4>
                </div>
                <p className="text-xs text-blue-700">Case coordination, urgency assessment, specialist routing</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center italic">
              After initial triage, you can request a full multi-specialist consultation for a deeper analysis
            </p>
          </div>
        </details>

        {/* Question Form */}
        <form onSubmit={handleTriageSubmit} className="mb-6">
          {/* Query Type Selector — optional pre-selection; omit for auto-detect */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">I&apos;m asking about:</span>
            {(['clinical', 'informational'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setUserQueryType(userQueryType === type ? null : type)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  userQueryType === type
                    ? type === 'clinical'
                      ? 'bg-blue-100 border-blue-500 text-blue-800'
                      : 'bg-purple-100 border-purple-500 text-purple-800'
                    : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'
                }`}
              >
                {type === 'clinical' ? 'My Symptoms' : 'General Question'}
              </button>
            ))}
          </div>
          <div className="mb-4">
            <label htmlFor="web-question" className="block text-sm font-medium text-gray-700 mb-2">
              What orthopedic question can I help you with?
            </label>
            <textarea
              id="web-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Describe your orthopedic concern. Include: age, pain level (1-10), activity level, and when symptoms started. Example: '45yo runner with knee pain (7/10) for 2 weeks after marathon training'"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              maxLength={2048}
              disabled={isLoading || getRemainingQuestions() === 0}
            />
            <div className="flex justify-end mt-1">
              <span className={`text-xs ${question.length > 1900 ? 'text-amber-600' : 'text-gray-400'}`}>
                {question.length}/2048
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !question.trim() || getRemainingQuestions() === 0}
            className="w-full font-medium py-3 px-4 rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {consultationStage === 'comprehensive_loading'
                  ? 'Consulting specialists (~50s)...'
                  : 'Getting triage assessment (~17s)...'}
              </span>
            ) : getRemainingQuestions() === 0 ? (
              'Daily limit reached - Try again tomorrow'
            ) : (
              'Get Assessment'
            )}
          </button>
        </form>

        {/* Triage loading — fast mode loading cards */}
        {consultationStage === 'triage_loading' && (
          <div className="mb-6">
            <AgentLoadingCards isLoading={true} mode="fast" />
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Scope Validation Display */}
        {scopeValidationData && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="text-4xl flex-shrink-0">
                {scopeValidationData.detectedCondition === 'cardiac' ? '❤️' :
                 scopeValidationData.detectedCondition === 'neurological' ? '🧠' :
                 scopeValidationData.detectedCondition === 'gastrointestinal' ? '🩺' :
                 scopeValidationData.detectedCondition === 'respiratory' ? '🫁' :
                 scopeValidationData.detectedCondition === 'dermatological' ? '🧴' :
                 '🏥'}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 text-lg mb-2">
                  {scopeValidationData.message.title}
                </h3>
                <p className="text-blue-800 mb-4">
                  {scopeValidationData.message.message}
                </p>
                <div className="p-4 bg-blue-100 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-2">
                    <span className="text-xl">💡</span>
                    <p className="text-blue-900 font-medium">
                      {scopeValidationData.message.suggestion}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <button
                    onClick={handleAskAnother}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Ask an Orthopedic Question
                  </button>
                  <span className="text-sm text-blue-600">
                    AequOs specializes in bones, joints, muscles, and sports medicine
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TRIAGE COMPLETE ── */}
        {consultationStage === 'triage_complete' && triageResult && (
          <div className="mb-6">
            <TriageResponseCard
              response={triageResult.response}
              confidence={triageResult.confidence}
              urgencyLevel={triageResult.urgencyLevel || 'routine'}
              suggestedFollowUp={triageResult.suggestedFollowUp || []}
              consultationId={triageResult.consultationId}
              onSeeFullAnalysis={queryType !== 'informational' ? handleComprehensiveUpgrade : undefined}
              onExit={handleTriageExit}
            />

            {/* Research results for informational queries */}
            {queryType === 'informational' && researchPolling.researchState.status !== 'idle' && (
              <div className="mt-4">
                <ResearchStatusRow researchState={researchPolling.researchState} />
                <ResearchDetailPanel researchState={researchPolling.researchState} isMiniApp={false} />
              </div>
            )}
          </div>
        )}

        {/* ── COMPREHENSIVE LOADING ── */}
        {consultationStage === 'comprehensive_loading' && triageResult && (
          <div className="mb-6">
            <TriageResponseCard
              response={triageResult.response}
              confidence={triageResult.confidence}
              urgencyLevel={triageResult.urgencyLevel || 'routine'}
              suggestedFollowUp={triageResult.suggestedFollowUp || []}
              collapsed={true}
            />
            <ComprehensiveLoadingState />

            {/* Pulsing "Track Your Recovery" button — appears after 5s */}
            {showPromisButton && !showPromisQuestionnaire && !promisCompleted && !promisPermaDismissed && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 relative"
              >
                <button
                  onClick={() => {
                    setShowPromisQuestionnaire(true);
                    setPromisStartedDuringLoading(true);
                    setShowPromisButton(false);
                  }}
                  className="w-full py-3 px-4 bg-white border-2 border-blue-300 rounded-xl text-center transition-all hover:border-blue-400 promis-pulse"
                >
                  <span className="text-sm font-semibold text-blue-700">Track Your Recovery</span>
                  <p className="text-xs text-gray-500 mt-0.5">Complete a 2-minute questionnaire while you wait</p>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePromisDismiss(comprehensiveResult?.consultationId || triageResult?.consultationId || ''); }}
                  className="absolute top-1 right-2 text-xs text-gray-400 hover:text-gray-500 leading-none p-1"
                  aria-label="Dismiss"
                >✕</button>
              </motion.div>
            )}
          </div>
        )}

        {/* ── SHARED PROMIS QUESTIONNAIRE ──
             Rendered outside both stage blocks so it persists across the
             comprehensive_loading → comprehensive_complete transition without
             unmounting, preserving all in-progress answers. */}
        {showPromisQuestionnaire && !promisCompleted && promisStartedDuringLoading &&
          (consultationStage === 'comprehensive_loading' || consultationStage === 'comprehensive_complete') && (
          <div className="mb-4">
            <PROMISQuestionnaire
              timepoint="baseline"
              consultationId={comprehensiveResult?.consultationId || triageResult?.consultationId || ''}
              isPainRelated={isPainRelatedConsultation(
                comprehensiveResult?.rawConsultationData?.caseData ||
                triageResult?.rawConsultationData?.caseData ||
                { rawQuery: currentQuestion }
              )}
              patientId={user?.id || 'web-guest'}
              onComplete={(result) => {
                setPromisResult(result);
                setPromisCompleted(true);
                setPendingComprehensiveReveal(false);
              }}
              onSkip={() => {
                setShowPromisQuestionnaire(false);
                setPromisStartedDuringLoading(false);
                setPendingComprehensiveReveal(false);
                if (consultationStage === 'comprehensive_loading' && !promisPermaDismissed) {
                  setShowPromisButton(true);
                }
              }}
            />
          </div>
        )}

        {/* ── COMPREHENSIVE COMPLETE ── */}
        {consultationStage === 'comprehensive_complete' && comprehensiveResult && (
          <div className="mb-6">
            {/* PROMIS results-ready CTA when questionnaire was active during loading */}
            {pendingComprehensiveReveal && promisCompleted && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-center"
              >
                <p className="text-sm text-green-800 font-medium mb-2">Your results are ready</p>
                <button
                  onClick={() => setPendingComprehensiveReveal(false)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                >
                  View Your Results &rarr;
                </button>
              </motion.div>
            )}

            {/* Data Completeness Indicator */}
            {comprehensiveResult.dataCompleteness !== undefined && (
              <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Data Completeness Assessment
                  </span>
                  <span className={`text-sm font-semibold ${
                    comprehensiveResult.dataCompleteness >= 0.8 ? 'text-green-600' :
                    comprehensiveResult.dataCompleteness >= 0.6 ? 'text-yellow-600' :
                    comprehensiveResult.dataCompleteness >= 0.3 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    {Math.round(comprehensiveResult.dataCompleteness * 100)}%
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      comprehensiveResult.dataCompleteness >= 0.8 ? 'bg-green-500' :
                      comprehensiveResult.dataCompleteness >= 0.6 ? 'bg-yellow-500' :
                      comprehensiveResult.dataCompleteness >= 0.3 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${comprehensiveResult.dataCompleteness * 100}%` }}
                  ></div>
                </div>

                <p className={`text-xs ${
                  comprehensiveResult.dataCompleteness >= 0.8 ? 'text-green-700' :
                  comprehensiveResult.dataCompleteness >= 0.6 ? 'text-yellow-700' :
                  comprehensiveResult.dataCompleteness >= 0.3 ? 'text-orange-700' : 'text-red-700'
                }`}>
                  {comprehensiveResult.dataCompleteness >= 0.8 ? '✅ Complete data - full specialist consultation available' :
                   comprehensiveResult.dataCompleteness >= 0.6 ? '⚠️ Good data - comprehensive assessment provided' :
                   comprehensiveResult.dataCompleteness >= 0.3 ? '🔍 Partial data - some specialists may be limited' :
                   '📝 Limited data - basic assessment only'}
                </p>

                {comprehensiveResult.fromAgentsSystem && (
                  <div className="mt-2 flex items-center text-xs text-indigo-600">
                    <span className="mr-1">⚖️</span>
                    Calibrated equipoise mapping across the specialist panel
                  </div>
                )}
              </div>
            )}

            {/* Specialist Coverage */}
            {comprehensiveResult.specialistCoverage && Object.keys(comprehensiveResult.specialistCoverage).length > 0 && (
              <div className="mb-4 p-4 bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-lg">
                <div className="flex items-center mb-3">
                  <span className="text-lg mr-2">🏥</span>
                  <h4 className="font-semibold text-teal-800">Specialist Coverage</h4>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(comprehensiveResult.specialistCoverage).map(([specialist, participated]) => (
                    <div key={specialist} className={`flex items-center text-xs p-2 rounded ${
                      participated ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      <span className="mr-1">{participated ? '✅' : '⭕'}</span>
                      {specialist.charAt(0).toUpperCase() + specialist.slice(1).replace('_', ' ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ResponseCard
              response={comprehensiveResult.response}
              confidence={comprehensiveResult.confidence}
              isFiltered={comprehensiveResult.isFiltered}
              isPendingReview={comprehensiveResult.isPendingReview}
              isApproved={comprehensiveResult.isApproved}
              reviewedBy={comprehensiveResult.reviewedBy}
              reviewType={comprehensiveResult.reviewType}
              hasAdditions={comprehensiveResult.hasAdditions}
              hasCorrections={comprehensiveResult.hasCorrections}
              additionsText={comprehensiveResult.additionsText}
              correctionsText={comprehensiveResult.correctionsText}
              question={currentQuestion}
              fid={user?.id || 'web-guest'}
              caseId={`web-${Date.now()}`}
              inquiry={comprehensiveResult.inquiry}
              keyPoints={comprehensiveResult.keyPoints}
              questionId={comprehensiveResult.questionId?.toString()}
              isAuthenticated={isAuthenticated}
              enrichments={comprehensiveResult.enrichments}
              hasResearch={comprehensiveResult.hasResearch}
              userTier={comprehensiveResult.userTier}
              agentCoordination={comprehensiveResult.agentNetwork ? {
                activeAgents: comprehensiveResult.agentNetwork.activeAgents,
                totalAgents: comprehensiveResult.agentNetwork.totalCapacity,
                coordinationType: comprehensiveResult.agentRouting?.networkExecuted ? 'parallel' : 'sequential',
                networkStatus: (comprehensiveResult.agentNetwork.activeAgents > 0 && comprehensiveResult.agentRouting?.networkExecuted) ? 'active' : 'degraded',
                performance: comprehensiveResult.agentPerformance ? {
                  successRate: comprehensiveResult.agentPerformance.successRate,
                  avgResponseTime: comprehensiveResult.agentPerformance.averageExecutionTime
                } : undefined,
                currentLoad: comprehensiveResult.agentNetwork.currentLoad,
                maxLoad: comprehensiveResult.agentNetwork.totalCapacity,
                taskRoutes: comprehensiveResult.agentRouting ? [{
                  from: 'web-user',
                  to: comprehensiveResult.agentRouting.selectedAgent,
                  reason: comprehensiveResult.agentRouting.routingReason
                }] : undefined
              } : undefined}
              specialistConsultation={comprehensiveResult.specialistConsultation}
              agentBadges={comprehensiveResult.agentBadges}
              hasSpecialistConsultation={comprehensiveResult.hasSpecialistConsultation}
              rawConsultationData={comprehensiveResult.rawConsultationData}
              researchState={effectiveResearchState}
              onFeedbackSubmitted={setFeedbackSubmitted}
              onStartCheckIn={!showPromisQuestionnaire && !promisCompleted ? () => setShowPromisQuestionnaire(true) : undefined}
            />

            {/* PROMIS — shown after results so they don't compete for attention */}

            {/* Completion summary: baseline recorded */}
            {promisCompleted && promisResult && (
              <div className="mt-4 mb-2 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                <span className="text-green-600 text-lg">✅</span>
                <div>
                  <p className="text-xs font-semibold text-green-800">Recovery baseline recorded</p>
                  <p className="text-xs text-green-700">
                    Physical Function T-Score: {promisResult.scores.physicalFunctionTScore}
                    {promisResult.scores.painInterferenceTScore != null && ` · Pain Interference: ${promisResult.scores.painInterferenceTScore}`}
                    {' '}· We&apos;ll check in at 2, 4, and 8 weeks
                  </p>
                </div>
              </div>
            )}

            {/* Second-chance PROMIS button — shown after results if not yet started */}
            {!showPromisQuestionnaire && !promisCompleted && !promisPermaDismissed && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 mb-2 relative"
              >
                <button
                  onClick={() => setShowPromisQuestionnaire(true)}
                  className="w-full py-3 px-4 bg-white border-2 border-blue-300 rounded-xl text-center transition-all hover:border-blue-400 promis-pulse"
                >
                  <span className="text-sm font-semibold text-blue-700">Track Your Recovery</span>
                  <p className="text-xs text-gray-500 mt-0.5">2-minute questionnaire to track your progress over time</p>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePromisDismiss(comprehensiveResult?.consultationId || triageResult?.consultationId || ''); }}
                  className="absolute top-1 right-2 text-xs text-gray-400 hover:text-gray-500 leading-none p-1"
                  aria-label="Dismiss"
                >✕</button>
              </motion.div>
            )}

            {/* Inline PROMIS questionnaire for second-chance path (started after results revealed) */}
            {showPromisQuestionnaire && !promisCompleted && !promisStartedDuringLoading && (
              <div className="mt-4 mb-2">
                <PROMISQuestionnaire
                  timepoint="baseline"
                  consultationId={comprehensiveResult.consultationId || triageResult?.consultationId || ''}
                  isPainRelated={isPainRelatedConsultation(
                    comprehensiveResult.rawConsultationData?.caseData || { rawQuery: currentQuestion }
                  )}
                  patientId={user?.id || 'web-guest'}
                  onComplete={(result) => {
                    setPromisResult(result);
                    setPromisCompleted(true);
                  }}
                  onSkip={() => setShowPromisQuestionnaire(false)}
                />
              </div>
            )}

            {/* Post-consultation chatbot — placed directly below agent responses */}
            {comprehensiveResult.consultationId && (
              <ConsultationChatbot
                consultationId={comprehensiveResult.consultationId}
                consultationContext={{ response: comprehensiveResult.response, rawConsultationData: comprehensiveResult.rawConsultationData }}
                specialistContext="triage"
                userQuestion={currentQuestion}
                fid={user?.id || 'web-guest'}
                suggestedFollowUp={comprehensiveResult.suggestedFollowUp || triageResult?.suggestedFollowUp || []}
              />
            )}

            {/* Action Menu */}
            <ActionMenu
              response={comprehensiveResult.response}
              question={currentQuestion}
              onAskAnother={handleAskAnother}
              onViewArtwork={() => setShowPrescriptionModal(true)}
              canAskAnother={getRemainingQuestions() > 0}
              questionsRemaining={getRemainingQuestions()}
              inquiry={comprehensiveResult.inquiry}
              keyPoints={comprehensiveResult.keyPoints}
              feedbackSubmitted={feedbackSubmitted}
              requiresFeedback={comprehensiveResult.hasSpecialistConsultation || false}
            />

            {/* Mini App Handoff Prompt */}
            {!user?.authType && comprehensiveResult.consultationId && (
              <div className="mt-6 p-5 bg-gradient-to-r from-purple-50 via-blue-50 to-teal-50 border-2 border-purple-300 rounded-xl shadow-md">
                <div className="flex items-start mb-3">
                  <span className="text-3xl mr-3">🚀</span>
                  <div>
                    <h3 className="font-bold text-purple-900 text-lg">Get the Full AequOs Experience</h3>
                    <p className="text-purple-700 text-sm mt-1">Continue tracking your recovery in the mini app</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-3 mb-4">
                  <div className="bg-white bg-opacity-70 p-3 rounded-lg border border-purple-200">
                    <div className="text-2xl mb-1">📅</div>
                    <div className="text-xs font-semibold text-purple-900">Milestone Tracking</div>
                    <div className="text-xs text-purple-700">Day 3, 7, 14, 21, 30 check-ins</div>
                  </div>
                  <div className="bg-white bg-opacity-70 p-3 rounded-lg border border-blue-200">
                    <div className="text-2xl mb-1">🪙</div>
                    <div className="text-xs font-semibold text-blue-900">Token Rewards</div>
                    <div className="text-xs text-blue-700">Earn tokens for feedback</div>
                  </div>
                  <div className="bg-white bg-opacity-70 p-3 rounded-lg border border-teal-200">
                    <div className="text-2xl mb-1">🔔</div>
                    <div className="text-xs font-semibold text-teal-900">Smart Reminders</div>
                    <div className="text-xs text-teal-700">Never miss a check-in</div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => window.open('https://farcaster.xyz/miniapps/XPiab1fRlKbA/aequos---ai-orthopedic-expert', '_blank')}
                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all font-semibold text-sm shadow-lg"
                  >
                    🔗 Continue in Mini App
                  </button>
                </div>

                <p className="text-xs text-purple-600 text-center mt-3">
                  Your consultation ID: <span className="font-mono bg-white px-2 py-1 rounded">{comprehensiveResult.consultationId}</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── EXITED ── */}
        {consultationStage === 'exited' && (
          <div className="mb-6">
            {/* Full triage response — persists after feedback modal */}
            {triageResult && (
              <TriageResponseCard
                response={triageResult.response}
                confidence={triageResult.confidence}
                urgencyLevel={triageResult.urgencyLevel || 'routine'}
                suggestedFollowUp={triageResult.suggestedFollowUp || []}
              />
            )}

            {/* Research results for informational queries (persists after exit) */}
            {queryType === 'informational' && researchPolling.researchState.status !== 'idle' && (
              <div className="mb-4">
                <ResearchStatusRow researchState={researchPolling.researchState} />
                <ResearchDetailPanel researchState={researchPolling.researchState} isMiniApp={false} />
              </div>
            )}

            <div className="p-6 bg-green-50 border border-green-200 rounded-xl text-center">
              <p className="text-3xl mb-3">✅</p>
              <h3 className="font-semibold text-green-900 text-lg mb-2">Thank you for using AequOs!</h3>
              <p className="text-sm text-green-700 mb-4">We hope the triage assessment was helpful.</p>

              {/* Post-consultation chatbot */}
              {triageResult?.consultationId && (
                <div className="text-left mb-4">
                  <ConsultationChatbot
                    consultationId={triageResult.consultationId}
                    consultationContext={{ response: triageResult.response, rawConsultationData: triageResult.rawConsultationData }}
                    specialistContext="triage"
                    userQuestion={currentQuestion}
                    fid={user?.id || 'web-guest'}
                    suggestedFollowUp={triageResult.suggestedFollowUp || []}
                    defaultOpen={true}
                  />
                </div>
              )}

              {/* PROMIS opt-in for triage-exit users (after feedback) — not for informational queries */}
              {feedbackSubmitted && !showTriagePromis && !triagePromisCompleted && queryType !== 'informational' && !promisPermaDismissed && triageResult?.consultationId && (
                <div className="mb-4 relative">
                  <button
                    onClick={() => setShowTriagePromis(true)}
                    className="w-full py-3 px-4 bg-white border-2 border-blue-300 rounded-xl text-center transition-all hover:border-blue-400 promis-pulse"
                  >
                    <span className="text-sm font-semibold text-blue-700">Track Your Recovery</span>
                    <p className="text-xs text-gray-500 mt-0.5">2 minutes &bull; Helps track your progress over time</p>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePromisDismiss(triageResult.consultationId || ''); }}
                    className="absolute top-1 right-2 text-xs text-gray-400 hover:text-gray-500 leading-none p-1"
                    aria-label="Dismiss"
                  >✕</button>
                </div>
              )}

              {/* PROMIS questionnaire inline for triage-exit */}
              {showTriagePromis && !triagePromisCompleted && triageResult?.consultationId && (
                <div className="text-left mb-4">
                  <PROMISQuestionnaire
                    timepoint="baseline"
                    consultationId={triageResult.consultationId}
                    isPainRelated={isPainRelatedConsultation(triageResult.rawConsultationData?.caseData || { rawQuery: currentQuestion })}
                    patientId={user?.id || 'web-guest'}
                    onComplete={(result) => {
                      setTriagePromisCompleted(true);
                      setPromisResult(result);
                    }}
                    onSkip={() => setShowTriagePromis(false)}
                  />
                </div>
              )}

              {/* PROMIS completion for triage-exit */}
              {triagePromisCompleted && (
                <div className="mb-4 p-3 bg-green-100 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-700">Baseline questionnaire complete</p>
                </div>
              )}

              <div className="mt-8 pt-4 border-t border-green-200">
                <button
                  onClick={handleAskAnother}
                  className={`px-6 py-2 rounded-lg transition-colors font-medium ${
                    feedbackSubmitted && !triagePromisCompleted && !showTriagePromis
                      ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Ask Another Question
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Prescription Modal */}
        <PrescriptionModal
          isOpen={showPrescriptionModal}
          onClose={() => setShowPrescriptionModal(false)}
          question={currentQuestion}
          response={comprehensiveResult?.response || triageResult?.response || ''}
          fid={user?.id || 'web-guest'}
          inquiry={comprehensiveResult?.inquiry || triageResult?.inquiry}
          keyPoints={comprehensiveResult?.keyPoints || triageResult?.keyPoints}
          rawConsultationData={comprehensiveResult?.rawConsultationData || triageResult?.rawConsultationData}
        />

        {/* FeedbackModal for triage exit */}
        {consultationStage === 'exited' && triageResult && (
          <FeedbackModal
            isOpen={showFeedbackModal}
            onClose={() => setShowFeedbackModal(false)}
            consultationId={triageResult.consultationId || triageResult.specialistConsultation?.consultationId || ''}
            patientId={user?.id || 'web-guest'}
            mode="fast"
            queryType={triageResult?.queryType || 'clinical'}
            onFeedbackSubmitted={(_rewards) => setFeedbackSubmitted(true)}
          />
        )}

        {/* Call to Action */}
        <div className="text-center mt-8 p-6 bg-gradient-to-br from-blue-50 via-purple-50 to-teal-50 border-2 border-blue-300 rounded-xl shadow-lg">
          <h3 className="text-blue-900 font-bold text-xl mb-2">🎯 Unlock the Full AequOs Experience</h3>
          <p className="text-blue-700 text-sm mb-4 max-w-2xl mx-auto">
            Get unlimited questions, milestone tracking, token rewards, and personalized recovery guidance in our Farcaster mini app!
          </p>

          <div className="grid md:grid-cols-4 gap-3 mb-5 max-w-3xl mx-auto">
            <div className="bg-white bg-opacity-80 p-3 rounded-lg border border-blue-200">
              <div className="text-2xl mb-1">∞</div>
              <div className="text-xs font-semibold text-blue-900">Unlimited</div>
              <div className="text-xs text-blue-700">Questions</div>
            </div>
            <div className="bg-white bg-opacity-80 p-3 rounded-lg border border-purple-200">
              <div className="text-2xl mb-1">📊</div>
              <div className="text-xs font-semibold text-purple-900">Progress</div>
              <div className="text-xs text-purple-700">Tracking</div>
            </div>
            <div className="bg-white bg-opacity-80 p-3 rounded-lg border border-teal-200">
              <div className="text-2xl mb-1">🎁</div>
              <div className="text-xs font-semibold text-teal-900">Token</div>
              <div className="text-xs text-teal-700">Rewards</div>
            </div>
            <div className="bg-white bg-opacity-80 p-3 rounded-lg border border-indigo-200">
              <div className="text-2xl mb-1">🔔</div>
              <div className="text-xs font-semibold text-indigo-900">Smart</div>
              <div className="text-xs text-indigo-700">Reminders</div>
            </div>
          </div>

          <button
            onClick={() => window.open('https://farcaster.xyz/miniapps/XPiab1fRlKbA/aequos---ai-orthopedic-expert', '_blank')}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all font-bold shadow-lg transform hover:scale-105"
          >
            <span className="mr-2">🚀</span>
            Launch AequOs Mini App
          </button>

          <p className="text-xs text-blue-600 mt-3">
            Available on Farcaster • Free to use • Web3 powered
          </p>
        </div>

        {/* Upgrade Form Modal */}
        {showUpgradeForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              {magicLinkSent && upgradeSentEmail ? (
                <>
                  <div className="text-center mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Check your email</h3>
                    <p className="text-sm text-gray-600">We sent a magic link to</p>
                    <p className="text-blue-600 font-medium text-sm">{upgradeSentEmail}</p>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <p className="text-xs text-gray-600 text-center">
                      Click the link in your email to verify. The link expires in 15 minutes.
                    </p>
                  </div>

                  <button
                    onClick={handleCloseUpgradeForm}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Got it
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold mb-4">Add Email to Your Account</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Get 10 questions/day with a verified email address.
                  </p>

                  <form onSubmit={handleUpgradeToEmail}>
                    <div className="mb-4">
                      <label htmlFor="upgrade-email" className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        id="upgrade-email"
                        value={upgradeEmail}
                        onChange={(e) => setUpgradeEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        disabled={authLoading}
                        required
                      />
                    </div>

                    {upgradeError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-800 text-sm">{upgradeError}</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleCloseUpgradeForm}
                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                        disabled={authLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={authLoading || !upgradeEmail.trim()}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                      >
                        {authLoading ? 'Sending...' : 'Send Magic Link'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div className="text-center text-xs text-gray-500 mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="font-medium text-yellow-800 mb-1">⚠️ Medical Disclaimer</p>
          <p>
            This AI provides educational information only and should not replace professional medical advice.
            Always consult with a qualified healthcare provider for medical concerns, diagnosis, or treatment decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
