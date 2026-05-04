// Ticket comes in
export interface Ticket {
  id: string;
  customerId: string;
  customerName: string;
  subject: string;
  body: string;
  priority: "low" | "medium" | "high";
  createdAt: Date;
}

// Ticket Resolution goes out
export interface TicketResolution {
    ticketId: string;
    response: string;
    action: "resolved" | "escalated" | "needs_info";
    confidence: number;
    resolvedAt: string;
} 

export interface AgentMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface TriageResult {
  category: "login" | "billing" | "technical" | "account" | "general";
  complexity: "simple" | "moderate" | "complex";
  estimatedResolutionTime: string;
  suggestedAction: "resolve" | "escalate" | "needs_info";
}

export interface ResearchResult {
  kbArticlesFound: string[];
  proposedSolution: string;
  confidence: number;
  additionalInfoNeeded: string[];
}

export interface EscalationResult {
  shouldEscalate: boolean;
  reason: string;
  priority: "low" | "medium" | "high" | "critical";
  suggestedTeam: string;
}

export interface OrchestratorPlan {
  strategy: string;
  reasoning: string; // extracted from thinking blocks
  runResearchInParallel: boolean;
  finalAction: "resolve" | "escalate" | "needs_info";
}