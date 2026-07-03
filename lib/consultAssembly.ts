import { ClaudeResponse } from './types';
import { fetchEquipoiseCards, triggerResearchAgents } from './agentsClient';
import {
  finalizeContentJob,
  markContentJobConsultationComplete,
  updateConsultationResponse,
  storeConsultation,
} from './database';
import { extractBodyPart } from './bodyPart';
import { extractRecoveryDays } from './recoveryDays';
import { buildEnrichments } from './specialists';
import { toContentDivergences } from './divergence';

const CONTENT_PIPELINE_FID = 'content-pipeline';

// Returns true when `data` is the Railway research-kickoff stub rather than a
// completed research result. Railway embeds { status: 'pending', estimatedSeconds,
// pollEndpoint } in the consultation response while the research agent is still running.
export function isResearchStub(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  return data.status === 'pending' || typeof data.pollEndpoint === 'string';
}

// Best-effort: swap the skeleton equipoise cards in a finalized payload for the
// persisted set (with populated evidence ledgers) once the backend has them.
// Falls back to whatever is already on the payload if the populated set isn't
// ready (count short) or the fetch fails. Mutates and returns the payload.
export async function withPopulatedEquipoiseCards(payload: any, consultationId: string): Promise<any> {
  try {
    const current = payload?.consultation?.equipoiseCards;
    const expected = Array.isArray(current) ? current.length : 0;
    if (expected === 0) return payload;
    const { cards: populated, complete } = await fetchEquipoiseCards(consultationId);
    // Only swap in the persisted set once background detection reports complete.
    // No count-match gate: detection can SUPPRESS a decision, so the final count
    // may be smaller than the skeleton count. This is a single-shot fetch — if
    // detection is still running (the common case right after the sync response),
    // we keep the skeletons and let the client poll finish the job.
    if (complete) {
      payload.consultation.equipoiseCards = populated;
    }
  } catch (e) {
    console.error(`[v1/consult] populate equipoise cards failed for ${consultationId}:`, e);
  }
  return payload;
}

function buildResearchCaseData(question: string, rawConsultationData: any): any {
  const cd = rawConsultationData?.caseData;
  if (cd) {
    return {
      primaryComplaint: cd.primaryComplaint || question,
      symptoms: cd.symptoms,
      duration: cd.duration,
      location: cd.location,
      painLevel: cd.painLevel,
      age: cd.age,
      rawQuery: cd.rawQuery || question,
    };
  }
  return { primaryComplaint: question, rawQuery: question };
}

/**
 * Assemble the completed (or research-pending) consultation payload from an
 * already-transformed normal-mode ClaudeResponse, persist the consultation,
 * and finalize / stage the content job. Shared by:
 *   - GET  /api/v1/consult/[jobId]  (Railway polling → completed)
 *   - POST /api/v1/consult          (synchronous full consultation, e.g. cache hit)
 *
 * `claudeResponse` must come from transformNormalModeResponse, which sets
 * `rawConsultationData = result.consultation` and `researchData = result.research`,
 * so inline research is derived here from `claudeResponse.researchData`.
 *
 * Returns `{ kind: 'completed', payload }` when research is inline (job finalized
 * completed), or `{ kind: 'pending', payload, note }` when research was triggered
 * and the partial payload was staged for the GET research-polling phase.
 */
export async function assembleConsultationPayload(args: {
  claudeResponse: ClaudeResponse;
  jobId: string;
  question: string;
  createdAt: string | null;
  consultationId: string;
  responseTime: number;
}): Promise<{ kind: 'completed' | 'pending'; payload: any; note?: string }> {
  const { claudeResponse, jobId, question, createdAt, consultationId, responseTime } = args;

  const specialists = claudeResponse.participatingSpecialists || [];
  const enrichments = buildEnrichments(claudeResponse.rawConsultationData);

  let extractedBodyPart: string | null = null;
  try {
    extractedBodyPart = await extractBodyPart({
      question,
      keyFindings: Array.isArray((claudeResponse.rawConsultationData as any)?.keyFindings)
        ? ((claudeResponse.rawConsultationData as any).keyFindings as any[])
            .map((f: any) => (typeof f === 'string' ? f : f?.finding || ''))
            .filter(Boolean)
        : [],
    });
  } catch (e) {
    console.error(`[v1/consult/${jobId}] extractBodyPart failed:`, e);
  }

  let estimatedRecoveryDays: number | null = null;
  try {
    estimatedRecoveryDays = await extractRecoveryDays({
      question,
      bodyPart: extractedBodyPart,
    });
  } catch (e) {
    console.error(`[v1/consult/${jobId}] extractRecoveryDays failed:`, e);
  }

  const rawResearch = claudeResponse.researchData ?? null;
  const inlineResearch = rawResearch && !isResearchStub(rawResearch) ? rawResearch : null;

  try {
    const { exists } = await updateConsultationResponse({
      consultationId,
      status: 'completed',
      responseText: claudeResponse.response || '',
      rawConsultationData: claudeResponse.rawConsultationData,
      researchData: inlineResearch,
      participatingSpecialists: specialists,
      specialistCount: specialists.length,
      executionTime: responseTime || 0,
      bodyPart: extractedBodyPart,
      predictedRecoveryDays: estimatedRecoveryDays,
    });

    if (!exists && claudeResponse.response) {
      try {
        await storeConsultation({
          consultationId,
          questionId: null,
          fid: CONTENT_PIPELINE_FID,
          mode: 'normal',
          participatingSpecialists: specialists,
          specialistCount: specialists.length,
          executionTime: responseTime || 0,
          status: 'completed',
          questionText: question,
          responseText: claudeResponse.response,
          rawConsultationData: claudeResponse.rawConsultationData,
          researchData: inlineResearch,
          bodyPart: extractedBodyPart,
          predictedRecoveryDays: estimatedRecoveryDays,
        });
        console.log(`[v1/consult/${jobId}] Fallback insert created consultations row`);
      } catch (e) {
        console.error(`[v1/consult/${jobId}] Fallback insert failed:`, e);
      }
    }

    console.log(`[v1/consult/${jobId}] Persisted consultation ${consultationId}`);
  } catch (e) {
    console.error(`[v1/consult/${jobId}] Persist consultation failed:`, e);
  }

  const specialistPayload = enrichments.map(e => {
    const raw = (claudeResponse.rawConsultationData as any)?.responses?.find(
      (r: any) => (r.response?.specialistType || r.specialistType) === e.metadata.agentType
    );
    const recommendations = raw?.response?.recommendations || raw?.recommendations || [];
    return {
      name: e.title,
      type: e.metadata.specialist,
      response: e.content,
      confidence: e.metadata.confidence,
      recommendations,
    };
  });

  const synthesized = (claudeResponse.rawConsultationData as any)?.synthesizedRecommendations || null;
  const divergences = toContentDivergences(synthesized?.coordinationMetadata?.divergences, consultationId);

  const buildPayload = (researchStatus: 'complete' | 'pending', researchData: any) => {
    const completedIso = researchStatus === 'complete' ? new Date().toISOString() : null;
    return {
      jobId,
      status: researchStatus === 'complete' ? ('completed' as const) : ('pending' as const),
      question,
      createdAt,
      completedAt: completedIso,
      consultation: {
        response: claudeResponse.response || '',
        inquiry: claudeResponse.inquiry,
        keyPoints: claudeResponse.keyPoints || [],
        urgencyLevel: claudeResponse.urgencyLevel,
        dataCompleteness: claudeResponse.dataCompleteness,
        triageConfidence: claudeResponse.triageConfidence,
        suggestedFollowUp: claudeResponse.suggestedFollowUp || [],
        specialists: specialistPayload,
        treatmentPlan: synthesized,
        equipoiseCards: synthesized?.equipoiseCards || [],
        divergences,
        researchData,
      },
      meta: {
        bodyPart: extractedBodyPart,
        predictedRecoveryDays: estimatedRecoveryDays,
        participatingSpecialists: specialists,
        executionTime: responseTime || 0,
        consultationId,
        researchStatus,
      },
    };
  };

  // Inline research present — finalize immediately.
  if (inlineResearch) {
    const payload = await withPopulatedEquipoiseCards(buildPayload('complete', inlineResearch), consultationId);
    try {
      await finalizeContentJob({
        jobId,
        status: 'completed',
        resultPayload: payload,
        researchStatus: 'complete',
      });
    } catch (e) {
      console.error(`[v1/consult/${jobId}] finalize completed write failed:`, e);
    }
    return { kind: 'completed', payload };
  }

  // Research is missing — trigger it, stage the partial payload, return pending.
  const stagedPayload = buildPayload('pending', null);
  const note = 'Consultation complete, awaiting research';

  const triggerResult = await triggerResearchAgents({
    consultationId,
    caseData: buildResearchCaseData(question, claudeResponse.rawConsultationData),
    consultationResult: claudeResponse.rawConsultationData,
  });
  if (!triggerResult.ok) {
    console.warn(
      `[v1/consult/${jobId}] triggerResearchAgents returned not-ok (status=${triggerResult.status}): ${triggerResult.error || 'unknown'} — polling anyway`
    );
  }

  try {
    await markContentJobConsultationComplete({
      jobId,
      researchStatus: 'pending',
      resultPayload: stagedPayload,
    });
  } catch (e) {
    console.error(`[v1/consult/${jobId}] markContentJobConsultationComplete failed:`, e);
  }

  return { kind: 'pending', payload: stagedPayload, note };
}
