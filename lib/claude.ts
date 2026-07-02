import Anthropic from '@anthropic-ai/sdk';
import { ClaudeResponse, CaseData, ConsultationRequest, ConsultationMode } from './types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

const ORTHOPEDIC_PROMPT = `You are AequOs, a specialized AI assistant focused exclusively on orthopedic and sports medicine questions. Your role is to provide educational information about:

- Orthopedic conditions and injuries
- Sports medicine and athletic injuries  
- Bone, joint, muscle, and ligament issues
- Physical therapy and rehabilitation
- Proper exercise and movement techniques
- Injury prevention strategies

IMPORTANT GUIDELINES:
1. Only answer questions related to orthopedics and sports medicine
2. Provide educational information in a clear, helpful manner
3. Be thorough but concise (aim for 200-400 words)
4. Use clear, patient-friendly language
5. Focus on providing valuable orthopedic knowledge

If a question is NOT related to orthopedics or sports medicine, politely redirect the user and explain that you only handle orthopedic questions.

Format your response as JSON with these fields:
- "response": Your educational response
- "isRelevant": true/false (whether question is orthopedic-related)
- "confidence": 0.0-1.0 (how confident you are in your response)
- "inquiry": A concise 10-15 word summary of the user's main question/topic
- "keyPoints": Array of 3-4 key medical facts or findings as brief bullet points (each 60-80 characters)`;

export async function getOrthoResponse(
  question: string,
  requestId?: string,
  options?: {
    mode?: ConsultationMode;
    userId?: string;
    isReturningUser?: boolean;
    priorConsultations?: string[];
    queryType?: string;
  }
): Promise<ClaudeResponse> {
  // First, try OrthoIQ-Agents system
  try {
    const agentsResponse = await tryOrthoIQAgents(question, requestId, options);
    if (agentsResponse) {
      console.log(`[${requestId || 'unknown'}] Successfully got response from OrthoIQ-Agents`);
      return agentsResponse;
    }
  } catch (agentsError) {
    console.warn(`[${requestId || 'unknown'}] OrthoIQ-Agents failed, falling back to Claude:`, agentsError);
  }

  // Fallback to Claude AI
  console.log(`[${requestId || 'unknown'}] Using Claude AI fallback`);
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: `${ORTHOPEDIC_PROMPT}\n\nUser Question: "${question}"\n\nPlease provide your response in the specified JSON format.`
        }
      ]
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from Claude');
    }

    // Try to parse JSON response
    let parsedResponse: ClaudeResponse;
    try {
      // Clean up potential markdown code block formatting
      let cleanedText = content.text.trim();
      if (cleanedText.includes('```json')) {
        cleanedText = cleanedText.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
      } else if (cleanedText.startsWith('```') && cleanedText.endsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }
      
      parsedResponse = JSON.parse(cleanedText);
    } catch (parseError) {
      // Fallback if JSON parsing fails
      console.warn('Failed to parse Claude JSON response, using fallback');
      console.log('Raw response that failed parsing:', content.text);
      
      // Try to extract just the response content if it looks like JSON
      let fallbackResponse = content.text;
      try {
        // Check if the text contains JSON structure and try to extract response field
        const jsonMatch = content.text.match(/"response"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
        if (jsonMatch && jsonMatch[1]) {
          fallbackResponse = jsonMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
        }
      } catch {
        // If regex extraction fails, use a generic fallback message
        fallbackResponse = "I apologize, but I'm having trouble formatting my response properly. Please try asking your question again.";
      }
      
      // Generate inquiry and keyPoints for fallback
      const inquiryFallback = question.length > 60 
        ? question.substring(0, 60).trim() + "..." 
        : question;
      
      const keyPointsFallback = fallbackResponse
        .split(/[.!?]/)
        .filter(sentence => sentence.trim().length > 20)
        .slice(0, 4)
        .map(point => point.trim().substring(0, 80));
      
      parsedResponse = {
        response: fallbackResponse,
        isRelevant: true,
        confidence: 0.7,
        inquiry: inquiryFallback,
        keyPoints: keyPointsFallback.length > 0 ? keyPointsFallback : ["Medical assessment points available"]
      };
    }

    // Validate required fields
    if (!parsedResponse.response) {
      throw new Error('Invalid response format from Claude');
    }

    return {
      response: parsedResponse.response,
      isRelevant: parsedResponse.isRelevant ?? true,
      confidence: parsedResponse.confidence ?? 0.7,
      inquiry: parsedResponse.inquiry,
      keyPoints: parsedResponse.keyPoints,
      fromAgentsSystem: false
    };

  } catch (error) {
    console.error('Error calling Claude API:', error);
    
    return {
      response: "I apologize, but I'm unable to process your question at this time due to a technical issue. Please try again later or consult with a healthcare professional for orthopedic concerns.",
      isRelevant: false,
      confidence: 0.0,
      fromAgentsSystem: false
    };
  }
}

export async function filterContent(question: string): Promise<boolean> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `Is this question related to orthopedics, sports medicine, bones, joints, muscles, ligaments, physical therapy, or athletic injuries? Answer only "YES" or "NO".\n\nQuestion: "${question}"`
        }
      ]
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      return false;
    }

    return content.text.trim().toUpperCase() === 'YES';
    
  } catch (error) {
    console.error('Error in content filtering:', error);
    // Default to allowing the question if filtering fails
    return true;
  }
}

// OrthoIQ-Agents integration function
async function tryOrthoIQAgents(
  question: string,
  requestId?: string,
  options?: {
    mode?: ConsultationMode;
    userId?: string;
    isReturningUser?: boolean;
    priorConsultations?: string[];
    queryType?: string;
  }
): Promise<ClaudeResponse | null> {
  const AGENTS_ENDPOINT = process.env.AEQUOS_AGENTS_URL || 'http://localhost:3000';
  const mode = options?.mode || 'fast'; // Default to fast mode
  const AGENTS_TIMEOUT = mode === 'fast' ? 100000 : 120000; // 100s for fast, 120s for normal

  // Debug: Log the endpoint being used to verify env var is correct
  console.log(`[${requestId || 'unknown'}] [AequOs] AGENTS_ENDPOINT resolved to: ${AGENTS_ENDPOINT}`);
  console.log(`[${requestId || 'unknown'}] [AequOs] AEQUOS_AGENTS_URL env var: ${process.env.AEQUOS_AGENTS_URL || 'NOT SET - using default'}`);

  try {
    // Health check first
    const healthResponse = await fetch(`${AGENTS_ENDPOINT}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000) // 10 second timeout for health check
    });

    if (!healthResponse.ok) {
      console.warn(`[${requestId || 'unknown'}] OrthoIQ-Agents health check failed: ${healthResponse.status}`);
      return null;
    }

    console.log(`[${requestId || 'unknown'}] OrthoIQ-Agents health check passed, making ${mode} mode consultation request`);

    // Extract comprehensive patient information from question
    const caseData = extractPatientDataFromQuestion(question, options);

    // Build consultation request with dual-track support
    const consultationRequest: ConsultationRequest = {
      caseData: {
        ...caseData,
        // Dual-track data
        rawQuery: question, // Original patient input for better context
        enableDualTrack: true, // Enable dual-track processing
        ...(options?.userId && { userId: options.userId }),
        ...(options?.isReturningUser !== undefined && { isReturningUser: options.isReturningUser }),
        ...(options?.priorConsultations && { priorConsultations: options.priorConsultations }),
        // Platform context
        platformContext: {
          source: 'web_app',
          version: '1.0.0'
        }
      },
      requiredSpecialists: undefined, // Let OrthoIQ-Agents routing logic decide based on data completeness and confidence
      mode,
      ...(options?.queryType && { queryType: options.queryType }),
    };

    // Make consultation request
    const { agentsFetch } = await import('./agentsClient');
    const consultationResponse = await agentsFetch('/consultation', {
      caller: 'web',
      method: 'POST',
      body: JSON.stringify(consultationRequest),
      signal: AbortSignal.timeout(AGENTS_TIMEOUT),
    });
    
    if (!consultationResponse.ok) {
      if (consultationResponse.status === 504) {
        console.warn(`[${requestId || 'unknown'}] OrthoIQ-Agents consultation timed out`);
      } else {
        console.warn(`[${requestId || 'unknown'}] OrthoIQ-Agents consultation failed: ${consultationResponse.status}`);
      }
      return null;
    }
    
    const result = await consultationResponse.json();

    console.log(`[${requestId || 'unknown'}] OrthoIQ-Agents raw response keys:`, Object.keys(result));
    console.log(`[${requestId || 'unknown'}] Response mode:`, result.mode, 'Success:', result.success, 'Requested mode:', mode);

    // Handle async processing response (normal mode fire-and-forget on Railway)
    // Fast mode also returns status:'processing' (background comprehensive fires in parallel),
    // but it includes a 'triage' key. Only treat as async if there is NO triage response.
    if (result.status === 'processing' && result.consultationId && !result.triage) {
      console.log(`[${requestId || 'unknown'}] Normal mode consultation processing async: ${result.consultationId}`);
      return {
        response: '',
        isRelevant: true,
        confidence: 0,
        fromAgentsSystem: true,
        processingAsync: true,
        consultationId: result.consultationId,
      };
    }

    if (!result.success) {
      // Check for scope validation response (out-of-scope queries)
      if (result.scopeValidation) {
        console.log(`[${requestId || 'unknown'}] OrthoIQ-Agents returned scope validation: ${result.scopeValidation.category}`);
        return {
          response: '', // Empty - WebOrthoInterface will use scopeValidation.message
          isRelevant: false,
          confidence: result.scopeValidation.confidence || 0.8,
          fromAgentsSystem: true,
          isOutOfScope: true,
          scopeValidation: result.scopeValidation
        };
      }
      // Fall back to Claude for other failures
      console.warn(`[${requestId || 'unknown'}] OrthoIQ-Agents returned unsuccessful result`);
      return null;
    }

    // Handle response - OrthoIQ-Agents can return either format:
    // 1. Informational response with mode='informational' and triage object (v0.7.0)
    // 2. Direct triage response with mode='fast' and triage object (documented format)
    // 3. Consultation object (alternative format)

    if (result.mode === 'informational' && result.triage) {
      console.log(`[${requestId || 'unknown'}] Processing informational query response`);
      const transformed = transformFastModeResponse(result, requestId, question);
      transformed.queryType = 'informational';
      transformed.querySubtype = result.querySubtype || null;
      return transformed;
    } else if (result.mode === 'fast' && result.triage) {
      console.log(`[${requestId || 'unknown'}] Processing direct fast mode triage response`);
      return transformFastModeResponse(result, requestId, question);
    } else if (result.mode === 'normal' && result.consultation) {
      console.log(`[${requestId || 'unknown'}] Processing direct normal mode consultation response`);
      return transformNormalModeResponse(result, requestId, question);
    } else if (result.consultation) {
      console.log(`[${requestId || 'unknown'}] Processing consultation response (requested mode: ${mode})`);
      // Transform the consultation based on what we requested
      if (mode === 'fast') {
        // For fast mode, extract just the triage specialist
        return transformFastModeConsultation(result, requestId, question);
      } else {
        // For normal mode, use the full consultation
        return transformNormalModeResponse(result, requestId, question);
      }
    } else {
      console.warn(`[${requestId || 'unknown'}] Unknown response format from OrthoIQ-Agents. Has consultation:`, !!result.consultation, 'Has triage:', !!result.triage);
      return null;
    }
    
  } catch (error) {
    const err = error as Error;
    if (err.name === 'TimeoutError' || err.message?.includes('timeout')) {
      console.warn(`[${requestId || 'unknown'}] OrthoIQ-Agents request timed out`);
    } else {
      console.warn(`[${requestId || 'unknown'}] OrthoIQ-Agents request failed:`, err.message || 'Unknown error');
    }
    return null;
  }
}

// Helper function to format structured response objects into readable text
function formatStructuredResponseContent(obj: any): string {
  if (typeof obj === 'string') return obj;

  // Backend now returns clean markdown, so just extract the response field if it exists
  if (obj && typeof obj === 'object' && obj.response && typeof obj.response === 'string') {
    return obj.response;
  }

  // Fallback: convert to string
  return String(obj);
}

// Extract patient data from question text for agents API
function extractPatientDataFromQuestion(
  question: string,
  options?: {
    userId?: string;
    isReturningUser?: boolean;
    priorConsultations?: string[];
  }
): CaseData {
  // Extract age
  const ageMatch = question.match(/(\d+)\s*(year|yo|y\.o|yr|years old)/i);
  const age = ageMatch ? parseInt(ageMatch[1]) : undefined;

  // Extract pain level — only match explicit scale references to avoid capturing
  // unrelated numbers like "pain for 15 years", "pain since age 45", "pain 20% of time"
  let painLevel: number | undefined = undefined;
  // 1. Numeric scale: "7/10", "7 out of 10", "pain level 7", "pain score 8", "rated 6"
  const numericPainMatch = question.match(
    /\b(\d+)\s*(?:\/\s*10|out\s+of\s+10)\b|\b(?:pain\s+level|pain\s+score|severity)\s*(?:is|of|at|:)?\s*(\d+)\b|\b(?:rated?s?|rating)\s+(?:it\s+)?(?:at\s+)?(\d+)\b/i
  );
  if (numericPainMatch) {
    const raw = parseInt(numericPainMatch[1] || numericPainMatch[2] || numericPainMatch[3]);
    painLevel = Math.min(10, Math.max(0, raw)); // hard clamp against Railway schema max:10
  } else {
    // 2. Word descriptors anywhere in the question
    const wordPainMatch = question.match(/\b(mild|moderate|severe|extreme)\b/i);
    if (wordPainMatch) {
      const painMap: { [key: string]: number } = {
        'mild': 3, 'moderate': 5, 'severe': 8, 'extreme': 9
      };
      painLevel = painMap[wordPainMatch[1].toLowerCase()];
    }
  }

  // Determine duration
  let duration: string | undefined = undefined;
  if (question.match(/acute|sudden|immediate|today|yesterday/i)) duration = 'acute';
  else if (question.match(/chronic|months|years|long.?term/i)) duration = 'chronic';
  else if (question.match(/weeks|sub.?acute/i)) duration = 'sub-acute';

  // Extract location
  const locationMatch = question.match(/\b(left|right|bilateral)?\s*(knee|shoulder|back|ankle|hip|wrist|elbow|neck|spine|foot|hand)\b/i);
  const location = locationMatch ? locationMatch[0] : undefined;

  // Detect athlete profile
  const athleteMatch = question.match(/\b(runner|athlete|marathon|triathlete|cyclist|swimmer|basketball|football|soccer|tennis|golf|baseball)\b/i);
  const activityMatch = question.match(/(\d+)\s*(miles?|km|hours?)\s*(?:per|\/)\s*week/i);

  const athleteProfile = athleteMatch ? {
    sport: athleteMatch[1],
    ...(activityMatch && { weeklyMileage: parseInt(activityMatch[1]) })
  } : undefined;

  // Detect pain triggers and relievers
  const triggerMatch = question.match(/(?:worse|triggered|aggravated)\s+(?:by|when|with|during)\s+([^,.]+)/i);
  const relieverMatch = question.match(/(?:better|relieved|helped)\s+(?:by|when|with)\s+([^,.]+)/i);

  // Detect movement restrictions
  const restrictionMatch = question.match(/(?:can't|cannot|unable to|difficulty)\s+([^,.]+)/i);

  // Detect psychological factors
  const anxietyMatch = question.match(/\b(anxious|worried|scared|afraid|stress|anxiety)\b/i);
  const anxietyLevel = anxietyMatch ? 6 : undefined;

  // Determine functional limitations
  const functionalLimitations = !!(
    question.match(/can't walk|unable to work|difficulty sleeping|can't lift|limited range/i)
  );

  // Determine movement dysfunction
  const movementDysfunction = !!(
    question.match(/stiff|restricted|limited range|mobility|movement/i)
  );

  // Determine psychological factors
  const psychologicalFactors = !!(anxietyMatch || question.match(/depression|mood|mental health/i));

  // Build case data
  const caseData: CaseData = {
    primaryComplaint: question.split('.')[0] || question, // Use first sentence as primary complaint
    symptoms: location ? `${location} symptoms` : undefined,
    ...(age && { age }),
    ...(painLevel && { painLevel }),
    ...(duration && { duration }),
    ...(location && { location }),
    ...(athleteProfile && { athleteProfile }),
    functionalLimitations,
    movementDysfunction,
    ...(anxietyLevel && { anxietyLevel }),
    psychologicalFactors,

    // Specialist-specific data
    painData: {
      ...(location && { location }),
      ...(painLevel && { quality: painLevel > 7 ? 'severe' : painLevel > 4 ? 'moderate' : 'mild' }),
      ...(triggerMatch && { triggers: [triggerMatch[1].trim()] }),
      ...(relieverMatch && { relievers: [relieverMatch[1].trim()] })
    },

    movementData: {
      ...(restrictionMatch && { restrictions: [restrictionMatch[1].trim()] }),
      ...(location && { patterns: [`${location} affected`] })
    },

    functionalData: {
      ...(restrictionMatch && { limitations: [restrictionMatch[1].trim()] }),
      goals: ['Pain reduction', 'Return to normal activities']
    },

    psychData: {
      ...(anxietyMatch && { fearAvoidance: true }),
      ...(anxietyMatch && { copingStrategies: [] })
    }
  };

  return caseData;
}

// Transform Fast Mode consultation (extracts triage from consultation object)
function transformFastModeConsultation(result: any, requestId?: string, userQuestion?: string): ClaudeResponse {
  console.log(`[${requestId || 'unknown'}] Transforming fast mode from consultation object`);

  const consultation = result.consultation;

  // Find the triage specialist in the responses
  let triageResponse = null;
  if (consultation.responses && Array.isArray(consultation.responses)) {
    triageResponse = consultation.responses.find((r: any) =>
      r.response?.specialistType === 'triage' || r.response?.specialist?.toLowerCase().includes('triage')
    );
  }

  if (!triageResponse && consultation.synthesizedRecommendations) {
    // Use synthesized recommendations if no triage found
    return transformNormalModeResponse(result, requestId, userQuestion);
  }

  if (!triageResponse) {
    console.warn(`[${requestId || 'unknown'}] No triage response found in consultation`);
    return transformNormalModeResponse(result, requestId, userQuestion);
  }

  const triage = triageResponse.response;
  let formattedResponse = '';

  // Add urgency if present
  if (triage.urgencyLevel && (triage.urgencyLevel === 'emergency' || triage.urgencyLevel === 'urgent')) {
    const urgencyEmoji = triage.urgencyLevel === 'emergency' ? '🚨' : '⚠️';
    formattedResponse += `${urgencyEmoji} **${triage.urgencyLevel.toUpperCase()}**\n\n`;
  }

  // Extract response and clean any code blocks
  if (triage.response) {
    let responseText = typeof triage.response === 'string' ? triage.response : String(triage.response);
    // Clean up any JSON code blocks that may still be present
    responseText = responseText
      .replace(/```json\s*\n/g, '')
      .replace(/```\s*$/g, '')
      .replace(/^```\s*/g, '');
    formattedResponse += responseText;
  }

  // Extract key points
  const keyPoints: string[] = [];
  if (triage.keyFindings && Array.isArray(triage.keyFindings)) {
    keyPoints.push(...triage.keyFindings.slice(0, 4).map((f: any) =>
      typeof f === 'string' ? f : f.finding || ''
    ).filter(Boolean));
  }

  // If no key points from findings, extract from response text
  if (keyPoints.length === 0 && triage.response) {
    const cleanText = typeof triage.response === 'string' ? triage.response : '';
    const plainText = cleanText.replace(/\*\*/g, '').replace(/#+/g, '');
    const sentences = plainText.split(/[.!?]+/).filter((s: string) => s.trim().length > 20);
    keyPoints.push(...sentences.slice(0, 4).map((s: string) => s.trim()));
  }

  // Extract inquiry from user question for prescription
  let inquiry = 'Orthopedic assessment';
  if (userQuestion) {
    const cleanQuestion = userQuestion.trim();
    inquiry = cleanQuestion.length > 60
      ? cleanQuestion.substring(0, 57).trim() + '...'
      : cleanQuestion;
  }

  return {
    response: formattedResponse,
    isRelevant: true,
    confidence: triage.confidence || consultation.triageConfidence || 0.85,
    inquiry,
    keyPoints,
    consultationId: consultation.consultationId,
    participatingSpecialists: ['triage'],
    fromAgentsSystem: true,
    suggestedFollowUp: triage.followUpQuestions?.length > 0
      ? triage.followUpQuestions
      : [
          'How long have you been experiencing these symptoms?',
          'What makes the pain better or worse?',
          'Have you tried any treatments so far?',
        ],
    triageConfidence: triage.confidence,
    urgencyLevel: triage.urgencyLevel || 'routine',
  };
}

// Transform Fast Mode response to ClaudeResponse format (for direct triage responses)
function transformFastModeResponse(result: any, requestId?: string, userQuestion?: string): ClaudeResponse {
  console.log(`[${requestId || 'unknown'}] Transforming fast mode triage response`);

  const triage = result.triage;

  // Backend now returns clean markdown in the response field - use it directly
  let formattedResponse = '';

  // Add urgency level if emergency/urgent
  if (triage.urgencyLevel === 'emergency' || triage.urgencyLevel === 'urgent') {
    const urgencyEmoji = triage.urgencyLevel === 'emergency' ? '🚨' : '⚠️';
    formattedResponse += `${urgencyEmoji} **${triage.urgencyLevel.toUpperCase()}**\n\n`;
  }

  // Extract response and clean any code blocks
  if (typeof triage.response === 'string') {
    // Clean up any JSON code blocks that may still be present
    const cleanResponse = triage.response
      .replace(/```json\s*\n/g, '')
      .replace(/```\s*$/g, '')
      .replace(/^```\s*/g, '');
    formattedResponse += cleanResponse;
  } else {
    // Fallback for unexpected format
    console.warn(`[${requestId || 'unknown'}] Unexpected triage response format:`, typeof triage.response);
    formattedResponse += String(triage.response);
  }

  // Extract key points from key findings
  const keyPoints: string[] = [];
  if (triage.keyFindings && Array.isArray(triage.keyFindings)) {
    keyPoints.push(...triage.keyFindings.slice(0, 4).map((f: any) =>
      typeof f === 'string' ? f : f.finding || ''
    ).filter(Boolean));
  }

  // If no key points from findings, extract from response markdown
  if (keyPoints.length === 0 && formattedResponse) {
    const plainText = formattedResponse.replace(/\*\*/g, '').replace(/#+/g, '').replace(/[🚨⚠️]/g, '');
    const sentences = plainText.split(/[.!?]+/).filter(s => s.trim().length > 20);
    keyPoints.push(...sentences.slice(0, 4).map(s => s.trim()));
  }

  // Extract inquiry from user question for prescription
  let inquiry = 'Orthopedic assessment';
  if (userQuestion) {
    // Use the user's original question as the inquiry
    const cleanQuestion = userQuestion.trim();
    inquiry = cleanQuestion.length > 60
      ? cleanQuestion.substring(0, 57).trim() + '...'
      : cleanQuestion;
  }

  return {
    response: formattedResponse,
    isRelevant: true,
    confidence: triage.confidence || 0.85,
    inquiry,
    keyPoints,
    // Agents-specific fields
    consultationId: result.consultationId,
    participatingSpecialists: ['triage'],
    fromAgentsSystem: true,
    // Fast mode specific
    suggestedFollowUp: triage.followUpQuestions?.length > 0
      ? triage.followUpQuestions
      : [
          'How long have you been experiencing these symptoms?',
          'What makes the pain better or worse?',
          'Have you tried any treatments so far?',
        ],
    triageConfidence: triage.confidence,
    urgencyLevel: triage.urgencyLevel || 'routine',
  };
}

// Transform Normal Mode response to ClaudeResponse format
export function transformNormalModeResponse(result: any, requestId?: string, userQuestion?: string): ClaudeResponse {
  console.log(`[${requestId || 'unknown'}] Transforming normal mode consultation with ${result.consultation.responses?.length || 0} specialists`);

  const consultation = result.consultation;
  let combinedResponse = '';

  // Use synthesized recommendations if available - backend now returns markdown
  if (consultation.synthesizedRecommendations?.synthesis) {
    const synthesis = consultation.synthesizedRecommendations.synthesis;

    // Debug logging to check synthesis format
    console.log(`[${requestId || 'unknown'}] Synthesis type:`, typeof synthesis);
    console.log(`[${requestId || 'unknown'}] Synthesis preview:`, synthesis.substring ? synthesis.substring(0, 100) : synthesis);

    // Clean any code blocks that may still be present
    let cleanSynthesis = typeof synthesis === 'string' ? synthesis : String(synthesis);
    cleanSynthesis = cleanSynthesis
      .replace(/```json\s*\n/g, '')
      .replace(/```\s*$/g, '')
      .replace(/^```\s*/g, '');
    combinedResponse = cleanSynthesis;

    // Add clinical flags if present
    if (consultation.synthesizedRecommendations.clinicalFlags?.redFlags?.length > 0) {
      const flags = consultation.synthesizedRecommendations.clinicalFlags.redFlags;
      if (flags.some((f: any) => f.severity === 'urgent' || f.severity === 'emergency')) {
        combinedResponse = '🚨 **URGENT:** ' + combinedResponse;
      }
    }
  } else if (consultation.responses && consultation.responses.length > 0) {
    // Fallback: combine specialist responses
    const specialistSections = consultation.responses.map((resp: any) => {
      const specialist = resp.response;
      const title = specialist.specialist || 'Specialist';
      let content = specialist.response || '';
      // Clean up any JSON code blocks
      content = content
        .replace(/```json\s*\n/g, '')
        .replace(/```\s*$/g, '')
        .replace(/^```\s*/g, '');
      return `**${title}:**\n${content}`;
    });
    combinedResponse = specialistSections.join('\n\n');
  }

  // Extract key points from all specialists
  const keyPoints: string[] = [];
  if (consultation.responses) {
    consultation.responses.forEach((resp: any) => {
      const specialist = resp.response;
      if (specialist.keyFindings) {
        keyPoints.push(...specialist.keyFindings.slice(0, 2).map((f: any) =>
          typeof f === 'string' ? f : f.finding || ''
        ));
      }
    });
  }

  // Extract follow-up questions
  let suggestedFollowUp: string[] = [];
  if (consultation.synthesizedRecommendations?.suggestedFollowUp) {
    suggestedFollowUp = consultation.synthesizedRecommendations.suggestedFollowUp.map((f: any) =>
      typeof f === 'string' ? f : f.question || ''
    );
  } else {
    suggestedFollowUp = result.suggestedFollowUp || [];
  }

  // Extract inquiry from user question for prescription
  let inquiry = 'Multi-specialist orthopedic consultation';
  if (userQuestion) {
    const cleanQuestion = userQuestion.trim();
    inquiry = cleanQuestion.length > 60
      ? cleanQuestion.substring(0, 57).trim() + '...'
      : cleanQuestion;
  }

  return {
    response: combinedResponse,
    isRelevant: true,
    confidence: result.triageConfidence || 0.9,
    inquiry,
    keyPoints: keyPoints.slice(0, 4),
    // Agents-specific fields
    dataCompleteness: result.dataCompleteness,
    suggestedFollowUp,
    triageConfidence: result.triageConfidence,
    specialistCoverage: result.specialistCoverage,
    participatingSpecialists: consultation.participatingSpecialists || [],
    consultationId: consultation.consultationId,
    fromAgentsSystem: true,
    rawConsultationData: consultation, // Preserve raw consultation data for specialist extraction
    researchData: result.research || null, // Inline research from agents system (bypasses polling)
  };
}

// Helper function to get specialist display names
function getSpecialistDisplayName(specialist: string): string {
  const names: { [key: string]: string } = {
    'triage': 'Triage Assessment',
    'pain_whisperer': 'Pain Management',
    'movement_detective': 'Movement Analysis', 
    'strength_sage': 'Rehabilitation',
    'mind_mender': 'Psychological Support'
  };
  return names[specialist] || specialist.charAt(0).toUpperCase() + specialist.slice(1);
}

// Helper function to format response content
function formatResponseContent(content: any): string {
  if (typeof content === 'string') return content;
  
  if (content && typeof content === 'object') {
    // Handle structured response objects
    const sections = [];
    
    if (content.assessment) sections.push(content.assessment);
    if (content.recommendations) sections.push(content.recommendations);
    if (content.findings) sections.push(content.findings);
    
    if (sections.length > 0) return sections.join(' ');
    
    // Fallback to JSON stringify
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }
  
  return String(content);
}
/**
 * Fetch the current status of a background normal-mode consultation from Railway.
 * Returns: { status: 'processing' | 'completed' | 'error' | 'not_found', ... }
 */
export async function fetchConsultationStatus(consultationId: string): Promise<any> {
  const { agentsFetch } = await import('./agentsClient');

  const res = await agentsFetch(`/consultation/${consultationId}/status`, {
    caller: 'web',
    method: 'GET',
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Status check failed: ${res.status} ${text}`);
  }

  return res.json();
}
