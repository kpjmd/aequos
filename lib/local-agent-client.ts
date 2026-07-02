import EventEmitter from 'events';
import { Agent, AgentContext, AgentResult, AgentEnrichment } from './types';
import { agentOrchestrator } from './agentOrchestrator';
import WebSocket from 'ws';

/**
 * Local Agent Client
 * 
 * A client for communicating with and coordinating local AI agents.
 * Follows existing API client patterns and integrates with the agent orchestration system.
 */

export interface LocalAgentConfig {
  id: string;
  name: string;
  type: 'http' | 'websocket' | 'process';
  endpoint?: string;
  capabilities: string[];
  maxConcurrentTasks: number;
  timeout: number;
  apiKey?: string;
  healthCheckInterval?: number;
}

export interface LocalAgentInstance {
  config: LocalAgentConfig;
  status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'busy';
  lastHealthCheck: Date;
  currentTasks: number;
  totalExecutions: number;
  successRate: number;
  averageResponseTime: number;
  connection?: WebSocket | any;
  agent?: Agent;
}

export interface LocalAgentTask {
  id: string;
  agentId: string;
  context: AgentContext;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'timeout';
  startTime?: Date;
  endTime?: Date;
  result?: AgentResult;
  retryCount: number;
  maxRetries: number;
}

export interface LocalAgentMetrics {
  totalAgents: number;
  connectedAgents: number;
  totalTasks: number;
  activeTasks: number;
  averageResponseTime: number;
  overallSuccessRate: number;
  networkLoad: number;
}

export class LocalAgentClient extends EventEmitter {
  private agents: Map<string, LocalAgentInstance> = new Map();
  private tasks: Map<string, LocalAgentTask> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private taskQueue: LocalAgentTask[] = [];
  private isProcessingQueue = false;
  private metrics: LocalAgentMetrics;
  private userPreferencesCache: Map<string, any> = new Map();

  /**
   * Helper function to format structured response objects into readable text
   */
  private formatStructuredResponse(obj: any): string {
    if (typeof obj === 'string') return obj;

    // Handle structured medical response format
    if (obj && typeof obj === 'object') {
      const sections = [];

      // ===== OrthoIQ-Agents Specialist Response Format =====
      // Extract the main response field if present
      if (obj.response && typeof obj.response === 'string') {
        sections.push(obj.response);
      }

      // Format recommendations as clean bulleted list
      if (obj.recommendations && Array.isArray(obj.recommendations)) {
        const recommendationsText = obj.recommendations.map((rec: any) => {
          if (typeof rec === 'string') return `• ${rec}`;
          if (rec && typeof rec === 'object') {
            const parts = [];

            // Add intervention name
            if (rec.intervention) {
              parts.push(rec.intervention);
            }

            // Add priority badge
            if (rec.priority !== undefined) {
              const priorityLabels = ['Low', 'Medium', 'High', 'Critical'];
              const priorityLabel = priorityLabels[Math.min(rec.priority, 3)] || `Priority ${rec.priority}`;
              parts.push(`[${priorityLabel} Priority]`);
            }

            // Add evidence grade
            if (rec.evidenceGrade) {
              parts.push(`(Grade ${rec.evidenceGrade} Evidence)`);
            }

            // Add timeline if present
            if (rec.timeline) {
              parts.push(`Timeline: ${rec.timeline}`);
            }

            return parts.length > 0 ? `• ${parts.join(' - ')}` : '';
          }
          return '';
        }).filter(Boolean).join('\n');

        if (recommendationsText) {
          sections.push(`\n**Recommendations:**\n${recommendationsText}`);
        }
      }

      // Note: Technical metadata (timestamp, responseTime, agreementWithTriage, status,
      // specialist, specialistType, confidence) is intentionally NOT displayed here

      // ===== Legacy Medical Response Format =====
      // Helper function to extract value from field (handles nested objects and arrays)
      const extractFieldValue = (field: any): string => {
        if (typeof field === 'string') return field;
        if (Array.isArray(field)) return field.join(', ');
        if (field && typeof field === 'object') {
          // If it's an object, try to extract meaningful text
          if (field.text || field.value || field.description) {
            return field.text || field.value || field.description;
          }
          // Otherwise, stringify but remove quotes and brackets for readability
          return JSON.stringify(field).replace(/["{}\[\]]/g, '').replace(/,/g, ', ');
        }
        return String(field);
      };

      if (obj.diagnosis) {
        const diagnosisText = extractFieldValue(obj.diagnosis);
        sections.push(`**Diagnosis:** ${diagnosisText}`);
      }

      if (obj.immediate_actions) {
        const actionsText = extractFieldValue(obj.immediate_actions);
        sections.push(`**Immediate Actions:** ${actionsText}`);
      }

      if (obj.red_flags) {
        const flagsText = extractFieldValue(obj.red_flags);
        sections.push(`**Red Flags:** ${flagsText}`);
      }

      if (obj.specialist_recommendation) {
        const recText = extractFieldValue(obj.specialist_recommendation);
        sections.push(`**Specialist Recommendation:** ${recText}`);
      }

      if (obj.followup) {
        const followupText = extractFieldValue(obj.followup);
        sections.push(`**Follow-up:** ${followupText}`);
      }

      // If it's a structured object with these fields, format them
      if (sections.length > 0) {
        return sections.join('\n\n');
      }

      // Otherwise, try to stringify it nicely
      try {
        return JSON.stringify(obj, null, 2);
      } catch {
        return String(obj);
      }
    }

    return String(obj);
  }

  constructor() {
    super();
    this.metrics = {
      totalAgents: 0,
      connectedAgents: 0,
      totalTasks: 0,
      activeTasks: 0,
      averageResponseTime: 0,
      overallSuccessRate: 1.0,
      networkLoad: 0
    };
    
    this.startTaskProcessor();
    this.startHealthMonitoring();
  }

  /**
   * Register a consultation agent specifically for the AequOs Agents API
   */
  async registerConsultationAgent(endpoint: string = process.env.AEQUOS_AGENTS_URL || process.env.ORTHOIQ_AGENTS_URL || 'http://localhost:3000'): Promise<void> {
    const config: LocalAgentConfig = {
      id: 'aequos-consultation',
      name: 'AequOs Consultation Network',
      type: 'http',
      endpoint,
      capabilities: ['consultation', 'medical_research', 'multi_specialist'],
      maxConcurrentTasks: 5,
      timeout: 50000, // Align with the 50-second timeout from integration docs
      healthCheckInterval: 30000 // More frequent health checks
    };

    await this.registerAgent(config);
  }

  /**
   * Register a local agent with the client
   */
  async registerAgent(config: LocalAgentConfig): Promise<void> {
    const instance: LocalAgentInstance = {
      config,
      status: 'disconnected',
      lastHealthCheck: new Date(),
      currentTasks: 0,
      totalExecutions: 0,
      successRate: 1.0,
      averageResponseTime: 0
    };

    this.agents.set(config.id, instance);
    this.updateMetrics();

    try {
      await this.connectAgent(instance);
      this.emit('agent:registered', config.id);
      console.log(`Local agent registered: ${config.name} (${config.id})`);
    } catch (error) {
      console.error(`Failed to connect agent ${config.id}:`, error);
      instance.status = 'error';
      this.emit('agent:error', config.id, error);
    }
  }

  /**
   * Connect to a local agent based on its type
   */
  private async connectAgent(instance: LocalAgentInstance): Promise<void> {
    const { config } = instance;
    
    instance.status = 'connecting';
    
    switch (config.type) {
      case 'websocket':
        await this.connectWebSocketAgent(instance);
        break;
      case 'http':
        await this.connectHTTPAgent(instance);
        break;
      case 'process':
        await this.connectProcessAgent(instance);
        break;
      default:
        throw new Error(`Unsupported agent type: ${config.type}`);
    }
    
    instance.status = 'connected';
    instance.lastHealthCheck = new Date();
    this.updateMetrics();
  }

  /**
   * Connect to WebSocket-based agent
   */
  private async connectWebSocketAgent(instance: LocalAgentInstance): Promise<void> {
    const { config } = instance;
    
    if (!config.endpoint) {
      throw new Error('WebSocket endpoint required');
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(config.endpoint!);
      
      ws.on('open', () => {
        instance.connection = ws;
        this.setupWebSocketHandlers(instance);
        resolve();
      });
      
      ws.on('error', (error) => {
        reject(error);
      });
      
      ws.on('close', () => {
        instance.status = 'disconnected';
        this.emit('agent:disconnected', config.id);
        this.updateMetrics();
      });
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(instance: LocalAgentInstance): void {
    const ws = instance.connection as WebSocket;
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleAgentMessage(instance.config.id, message);
      } catch (error) {
        console.error(`Failed to parse message from agent ${instance.config.id}:`, error);
      }
    });
  }

  /**
   * Connect to HTTP-based agent
   */
  private async connectHTTPAgent(instance: LocalAgentInstance): Promise<void> {
    const { config } = instance;
    
    if (!config.endpoint) {
      throw new Error('HTTP endpoint required');
    }

    // Test connection with health check
    try {
      const response = await fetch(`${config.endpoint}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey && { 'Authorization': `Bearer ${config.apiKey}` })
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP agent health check failed: ${response.status}`);
      }
      
      instance.connection = { type: 'http', endpoint: config.endpoint };
    } catch (error) {
      throw new Error(`Failed to connect to HTTP agent: ${error}`);
    }
  }

  /**
   * Connect to process-based agent
   */
  private async connectProcessAgent(instance: LocalAgentInstance): Promise<void> {
    // Create an in-process agent wrapper
    const agent: Agent = {
      name: instance.config.name,
      description: `Local agent: ${instance.config.name}`,
      
      canHandle: (context: AgentContext) => {
        // Check if agent capabilities match context requirements
        return instance.config.capabilities.some(cap => 
          context.metadata?.requiredCapabilities?.includes(cap) ||
          instance.config.capabilities.includes('*')
        );
      },
      
      execute: async (context: AgentContext): Promise<AgentResult> => {
        // This would be implemented based on the specific agent's logic
        return {
          success: true,
          enrichments: [{
            type: 'research',
            title: 'Local Agent Response',
            content: `Processed by local agent: ${instance.config.name}`,
            metadata: { 
              agentId: instance.config.id,
              capabilities: instance.config.capabilities
            }
          }],
          cost: 0.001
        };
      },
      
      estimateCost: (context: AgentContext) => {
        return 0.001; // Default cost for local agents
      }
    };
    
    instance.agent = agent;
    instance.connection = { type: 'process', agent };
    
    // Register with global orchestrator for coordination
    agentOrchestrator.registerAgent(agent);
  }

  /**
   * Handle messages from agents
   */
  private handleAgentMessage(agentId: string, message: any): void {
    const { type, taskId, payload } = message;
    
    switch (type) {
      case 'task_result':
        this.handleTaskResult(taskId, payload);
        break;
      case 'health_check':
        this.handleHealthCheck(agentId, payload);
        break;
      case 'error':
        this.handleAgentError(agentId, payload);
        break;
      default:
        console.warn(`Unknown message type from agent ${agentId}:`, type);
    }
  }

  /**
   * Execute a task using local agents
   */
  async executeTask(context: AgentContext, options: {
    preferredAgent?: string;
    requiredCapabilities?: string[];
    timeout?: number;
    maxRetries?: number;
  } = {}): Promise<AgentResult> {
    const taskId = `local_task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Find suitable agents
    const suitableAgents = this.findSuitableAgents(context, options.requiredCapabilities);
    
    if (suitableAgents.length === 0) {
      return {
        success: false,
        error: 'No suitable local agents available for this task'
      };
    }
    
    // Select best agent based on load and performance
    const selectedAgent = this.selectBestAgent(suitableAgents, options.preferredAgent);
    
    if (!selectedAgent) {
      return {
        success: false,
        error: 'All suitable agents are busy'
      };
    }
    
    // Create task
    const task: LocalAgentTask = {
      id: taskId,
      agentId: selectedAgent.config.id,
      context,
      status: 'pending',
      retryCount: 0,
      maxRetries: options.maxRetries || 3
    };
    
    this.tasks.set(taskId, task);
    this.taskQueue.push(task);
    this.updateMetrics();
    
    // Execute task
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || selectedAgent.config.timeout;
      
      const timeoutId = setTimeout(() => {
        task.status = 'timeout';
        task.endTime = new Date();
        resolve({
          success: false,
          error: `Task timed out after ${timeout}ms`
        });
      }, timeout);
      
      // Monitor task completion
      const checkCompletion = () => {
        const updatedTask = this.tasks.get(taskId);
        if (!updatedTask) return;
        
        if (updatedTask.status === 'completed') {
          clearTimeout(timeoutId);
          resolve(updatedTask.result!);
        } else if (updatedTask.status === 'failed') {
          clearTimeout(timeoutId);
          resolve(updatedTask.result!);
        } else {
          setTimeout(checkCompletion, 100);
        }
      };
      
      checkCompletion();
    });
  }

  /**
   * Find agents suitable for a context
   */
  private findSuitableAgents(context: AgentContext, requiredCapabilities?: string[]): LocalAgentInstance[] {
    const suitable: LocalAgentInstance[] = [];
    
    for (const instance of this.agents.values()) {
      if (instance.status !== 'connected') continue;
      if (instance.currentTasks >= instance.config.maxConcurrentTasks) continue;
      
      // Check capabilities
      if (requiredCapabilities) {
        const hasRequired = requiredCapabilities.every(cap => 
          instance.config.capabilities.includes(cap)
        );
        if (!hasRequired) continue;
      }
      
      // Check if agent can handle context (for process agents)
      if (instance.agent && !instance.agent.canHandle(context)) continue;
      
      suitable.push(instance);
    }
    
    return suitable;
  }

  /**
   * Select the best agent based on load and performance
   */
  private selectBestAgent(candidates: LocalAgentInstance[], preferredId?: string): LocalAgentInstance | null {
    if (preferredId) {
      const preferred = candidates.find(a => a.config.id === preferredId);
      if (preferred) return preferred;
    }
    
    // Score agents (lower is better)
    const scored = candidates.map(agent => ({
      agent,
      score: this.calculateAgentScore(agent)
    })).sort((a, b) => a.score - b.score);
    
    return scored.length > 0 ? scored[0].agent : null;
  }

  /**
   * Calculate agent score for selection
   */
  private calculateAgentScore(instance: LocalAgentInstance): number {
    const loadFactor = instance.currentTasks / instance.config.maxConcurrentTasks;
    const performanceFactor = 1 - instance.successRate;
    const responseFactor = instance.averageResponseTime / 10000; // Normalize
    
    return (loadFactor * 0.5) + (performanceFactor * 0.3) + (responseFactor * 0.2);
  }

  /**
   * Process task queue
   */
  private startTaskProcessor(): void {
    setInterval(async () => {
      if (this.isProcessingQueue || this.taskQueue.length === 0) return;
      
      this.isProcessingQueue = true;
      
      try {
        const task = this.taskQueue.shift();
        if (task) {
          await this.processTask(task);
        }
      } catch (error) {
        console.error('Task processor error:', error);
      }
      
      this.isProcessingQueue = false;
    }, 100);
  }

  /**
   * Process a single task
   */
  private async processTask(task: LocalAgentTask): Promise<void> {
    const agent = this.agents.get(task.agentId);
    if (!agent) {
      task.status = 'failed';
      task.result = { success: false, error: 'Agent not found' };
      return;
    }
    
    task.status = 'executing';
    task.startTime = new Date();
    agent.currentTasks++;
    
    if (agent.currentTasks >= agent.config.maxConcurrentTasks) {
      agent.status = 'busy';
    }
    
    try {
      let result: AgentResult;
      
      switch (agent.config.type) {
        case 'process':
          result = await agent.agent!.execute(task.context);
          break;
        case 'http':
          result = await this.executeHTTPTask(agent, task);
          break;
        case 'websocket':
          result = await this.executeWebSocketTask(agent, task);
          break;
        default:
          throw new Error(`Unsupported agent type: ${agent.config.type}`);
      }
      
      task.status = 'completed';
      task.result = result;
      task.endTime = new Date();
      
      // Update agent metrics
      this.updateAgentMetrics(agent, true, task);
      
    } catch (error) {
      task.status = 'failed';
      task.result = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      task.endTime = new Date();
      
      this.updateAgentMetrics(agent, false, task);

      // Retry logic with exponential backoff
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        task.status = 'pending';

        // Calculate backoff delay: 1s, 2s, 4s, 8s, etc.
        const backoffDelay = Math.min(1000 * Math.pow(2, task.retryCount - 1), 10000);

        console.log(`[LocalAgentClient] Retrying task ${task.id} (attempt ${task.retryCount}/${task.maxRetries}) after ${backoffDelay}ms`);

        // Add task back to queue after backoff delay
        setTimeout(() => {
          this.taskQueue.push(task);
        }, backoffDelay);
      } else {
        console.error(`[LocalAgentClient] Task ${task.id} failed after ${task.maxRetries} retries`);
      }
    } finally {
      agent.currentTasks--;
      if (agent.status === 'busy' && agent.currentTasks < agent.config.maxConcurrentTasks) {
        agent.status = 'connected';
      }
      this.updateMetrics();
    }
  }

  /**
   * Extract patient information from question text - DEPRECATED
   * Use extractPatientDataFromQuestion from lib/claude.ts instead
   */
  private extractPatientInfo(question: string): any {
    // This method is deprecated but kept for backward compatibility
    // The new format should be used via lib/claude.ts
    console.warn('[LocalAgentClient] Using deprecated extractPatientInfo - consider migrating to new format');

    return {
      primaryComplaint: question.split('.')[0] || question,
      symptoms: question, // String format, not array
      rawQuery: question, // For dual-track processing
      enableDualTrack: true
    };
  }

  /**
   * Get user preferences with caching
   */
  async getUserPreferences(fid: string): Promise<any> {
    // Check cache first
    if (this.userPreferencesCache.has(fid)) {
      return this.userPreferencesCache.get(fid);
    }

    try {
      const response = await fetch(`/api/user/preferences?fid=${fid}`);
      if (response.ok) {
        const preferences = await response.json();
        this.userPreferencesCache.set(fid, preferences);
        return preferences;
      }
    } catch (error) {
      console.warn(`[LocalAgentClient] Failed to load preferences for ${fid}:`, error);
    }

    // Return defaults if fetch fails
    return {
      preferred_mode: 'fast',
      preferred_platform: 'miniapp',
      is_new_user: true
    };
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(fid: string, preferences: any): Promise<void> {
    try {
      const response = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid, ...preferences })
      });

      if (response.ok) {
        // Update cache
        const result = await response.json();
        this.userPreferencesCache.set(fid, result.preferences);
      }
    } catch (error) {
      console.warn(`[LocalAgentClient] Failed to update preferences for ${fid}:`, error);
    }
  }

  /**
   * Clear preferences cache (useful for testing)
   */
  clearPreferencesCache(fid?: string): void {
    if (fid) {
      this.userPreferencesCache.delete(fid);
    } else {
      this.userPreferencesCache.clear();
    }
  }

  /**
   * Execute task via HTTP
   */
  private async executeHTTPTask(agent: LocalAgentInstance, task: LocalAgentTask): Promise<AgentResult> {
    const endpoint = agent.connection.endpoint;
    
    // For consultation agents, use the consultation endpoint format
    const isConsultationAgent = agent.config.capabilities.includes('consultation');
    const apiPath = isConsultationAgent ? '/consultation' : '/execute';
    
    let requestBody;
    if (isConsultationAgent) {
      // Extract patient information from the question
      const patientInfo = this.extractPatientInfo(task.context.question);

      // Get mode from context metadata or default to fast
      const mode = task.context.metadata?.mode || 'fast';

      // Transform context for consultation API with proper structure
      requestBody = {
        caseData: {
          ...patientInfo,
          // Add specialist-specific data fields so each specialist gets the question
          painData: { description: task.context.question, painLevel: patientInfo.painLevel },
          movementData: { description: task.context.question, rangeOfMotion: {} },
          functionalData: { description: task.context.question, functionalScore: patientInfo.functionalScore },
          psychData: { description: task.context.question, wellbeing: 5 }
        },
        requiredSpecialists: task.context.metadata?.requiredSpecialists ||
          ['triage', 'painWhisperer', 'movementDetective', 'strengthSage'],
        mode: mode // Use mode from context or default
      };

      // Log the request for debugging
      console.log(`[LocalAgentClient] Sending consultation request with mode: ${mode}`);
    } else {
      requestBody = {
        taskId: task.id,
        context: task.context
      };
    }
    
    const response = await fetch(`${endpoint}${apiPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(agent.config.apiKey && { 'Authorization': `Bearer ${agent.config.apiKey}` })
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP agent execution failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Transform consultation response to AgentResult format
    if (isConsultationAgent && result.success) {
      const consultation = result.consultation;

      // Debug logging to track what orthoiq-agents returns
      console.log('[LocalAgentClient] OrthoIQ-Agents consultation response specialists:');
      consultation.responses.forEach((response: any, index: number) => {
        console.log(`  [${index}] ${response.specialist || response.specialistType}:`, {
          confidence: response.confidence,
          hasAssessment: !!response.assessment,
          hasResponse: !!response.response
        });
      });

      return {
        success: true,
        enrichments: consultation.responses.map((response: any, index: number) => ({
          type: 'consultation',
          title: `${response.specialist} Assessment`,
          content: this.formatStructuredResponse(response.assessment || response.response),
          metadata: {
            specialist: response.specialist,
            confidence: response.confidence || 0.9,
            consultationId: consultation.consultationId,
            agentType: response.specialist
          }
        })),
        cost: 0.005,
        data: {
          metadata: {
            consultationId: consultation.consultationId,
            participatingSpecialists: consultation.participatingSpecialists,
            coordinationSummary: consultation.coordinationSummary,
            specialistCount: consultation.participatingSpecialists.length
          }
        }
      };
    }
    
    return result;
  }

  /**
   * Execute task via WebSocket
   */
  private async executeWebSocketTask(agent: LocalAgentInstance, task: LocalAgentTask): Promise<AgentResult> {
    const ws = agent.connection as WebSocket;
    
    return new Promise((resolve, reject) => {
      const message = {
        type: 'execute_task',
        taskId: task.id,
        context: task.context
      };
      
      // Set up one-time listener for this task
      const handleResponse = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.taskId === task.id && response.type === 'task_result') {
            ws.off('message', handleResponse);
            resolve(response.result);
          }
        } catch (error) {
          ws.off('message', handleResponse);
          reject(error);
        }
      };
      
      ws.on('message', handleResponse);
      ws.send(JSON.stringify(message));
    });
  }

  /**
   * Handle task result from agent
   */
  private handleTaskResult(taskId: string, result: AgentResult): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    
    task.status = 'completed';
    task.result = result;
    task.endTime = new Date();
    
    const agent = this.agents.get(task.agentId);
    if (agent) {
      this.updateAgentMetrics(agent, result.success, task);
    }
  }

  /**
   * Handle health check from agent
   */
  private handleHealthCheck(agentId: string, payload: any): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastHealthCheck = new Date();
      agent.status = payload.status || 'connected';
    }
  }

  /**
   * Handle error from agent
   */
  private handleAgentError(agentId: string, error: any): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'error';
      this.emit('agent:error', agentId, error);
    }
  }

  /**
   * Update agent performance metrics
   */
  private updateAgentMetrics(agent: LocalAgentInstance, success: boolean, task: LocalAgentTask): void {
    agent.totalExecutions++;
    
    if (task.startTime && task.endTime) {
      const duration = task.endTime.getTime() - task.startTime.getTime();
      agent.averageResponseTime = 
        (agent.averageResponseTime * (agent.totalExecutions - 1) + duration) / 
        agent.totalExecutions;
    }
    
    const successCount = Math.round(agent.successRate * (agent.totalExecutions - 1)) + (success ? 1 : 0);
    agent.successRate = successCount / agent.totalExecutions;
  }

  /**
   * Update overall metrics
   */
  private updateMetrics(): void {
    const agents = Array.from(this.agents.values());
    
    this.metrics.totalAgents = agents.length;
    this.metrics.connectedAgents = agents.filter(a => a.status === 'connected' || a.status === 'busy').length;
    this.metrics.activeTasks = agents.reduce((sum, a) => sum + a.currentTasks, 0);
    this.metrics.totalTasks = this.tasks.size;
    
    if (agents.length > 0) {
      this.metrics.averageResponseTime = 
        agents.reduce((sum, a) => sum + a.averageResponseTime, 0) / agents.length;
      this.metrics.overallSuccessRate = 
        agents.reduce((sum, a) => sum + a.successRate, 0) / agents.length;
      
      const totalCapacity = agents.reduce((sum, a) => sum + a.config.maxConcurrentTasks, 0);
      this.metrics.networkLoad = totalCapacity > 0 ? this.metrics.activeTasks / totalCapacity : 0;
    }
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [agentId, agent] of this.agents.entries()) {
        const timeSinceLastCheck = Date.now() - agent.lastHealthCheck.getTime();
        const healthInterval = agent.config.healthCheckInterval || 30000;
        
        if (timeSinceLastCheck > healthInterval && agent.status === 'connected') {
          try {
            await this.performHealthCheck(agent);
          } catch (error) {
            console.warn(`Health check failed for agent ${agentId}:`, error);
            agent.status = 'error';
            this.emit('agent:unhealthy', agentId);
          }
        }
      }
      
      this.updateMetrics();
    }, 10000); // Check every 10 seconds
  }

  /**
   * Perform health check on an agent
   */
  private async performHealthCheck(agent: LocalAgentInstance): Promise<void> {
    switch (agent.config.type) {
      case 'http':
        await this.httpHealthCheck(agent);
        break;
      case 'websocket':
        await this.websocketHealthCheck(agent);
        break;
      case 'process':
        // Process agents are always healthy if registered
        agent.lastHealthCheck = new Date();
        break;
    }
  }

  /**
   * HTTP health check
   */
  private async httpHealthCheck(agent: LocalAgentInstance): Promise<void> {
    const endpoint = agent.connection.endpoint;
    const response = await fetch(`${endpoint}/health`, {
      method: 'GET',
      headers: {
        ...(agent.config.apiKey && { 'Authorization': `Bearer ${agent.config.apiKey}` })
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP health check failed: ${response.status}`);
    }
    
    agent.lastHealthCheck = new Date();
  }

  /**
   * WebSocket health check
   */
  private async websocketHealthCheck(agent: LocalAgentInstance): Promise<void> {
    const ws = agent.connection as WebSocket;
    
    return new Promise((resolve, reject) => {
      const healthMessage = {
        type: 'health_check',
        timestamp: Date.now()
      };
      
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket health check timeout'));
      }, 5000);
      
      const handleResponse = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.type === 'health_check') {
            clearTimeout(timeout);
            ws.off('message', handleResponse);
            agent.lastHealthCheck = new Date();
            resolve();
          }
        } catch (error) {
          clearTimeout(timeout);
          ws.off('message', handleResponse);
          reject(error);
        }
      };
      
      ws.on('message', handleResponse);
      ws.send(JSON.stringify(healthMessage));
    });
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): LocalAgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): LocalAgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get current metrics
   */
  getMetrics(): LocalAgentMetrics {
    return { ...this.metrics };
  }

  /**
   * Disconnect an agent
   */
  async disconnectAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    // Wait for current tasks to complete
    while (agent.currentTasks > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Close connection
    if (agent.connection) {
      if (agent.config.type === 'websocket' && agent.connection.close) {
        agent.connection.close();
      }
      
      if (agent.agent) {
        agentOrchestrator.unregisterAgent(agent.agent.name);
      }
    }
    
    this.agents.delete(agentId);
    this.updateMetrics();
    this.emit('agent:disconnected', agentId);
  }

  /**
   * Shutdown the client
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Disconnect all agents
    const agentIds = Array.from(this.agents.keys());
    await Promise.all(agentIds.map(id => this.disconnectAgent(id)));
    
    this.emit('shutdown');
  }
}

// Export singleton instance
export const localAgentClient = new LocalAgentClient();