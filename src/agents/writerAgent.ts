import { claude } from "../lib/claude";
import {
  Ticket,
  TriageResult,
  ResearchResult,
  EscalationResult,
  TicketResolution,
} from "../types/ticket";

const SYSTEM_PROMPT = `You are a senior customer support writer. Your job is to take 
research findings and write a perfect customer-facing response.

Guidelines:
- Address the customer by first name
- Be empathetic and clear
- Provide concrete steps, not vague advice
- If escalating, explain what happens next without alarming the customer
- Keep it under 200 words
- End with a follow-up offer

Respond with raw JSON only — no markdown, no code fences:
{
  "response": "the complete customer-facing message",
  "action": "resolved" | "escalated" | "needs_info",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief internal note"
}`;

export async function runWriterAgent(
  ticket: Ticket,
  triage: TriageResult,
  research: ResearchResult,
  escalation: EscalationResult
): Promise<TicketResolution> {
  console.log(`[Writer Agent] Drafting response for ticket ${ticket.id}...`);

  const action = escalation.shouldEscalate
    ? "escalated"
    : research.additionalInfoNeeded.length > 0
    ? "needs_info"
    : "resolved";

  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `
Customer: ${ticket.customerName}
Issue: ${ticket.subject}
Category: ${triage.category} | Complexity: ${triage.complexity}

Proposed solution: ${research.proposedSolution}
Additional info needed: ${JSON.stringify(research.additionalInfoNeeded)}
Should escalate: ${escalation.shouldEscalate}
Escalation reason: ${escalation.reason}
Suggested team: ${escalation.suggestedTeam}
Recommended action: ${action}
        `.trim(),
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("[Writer Agent] No text response");
  }

  const cleaned = textBlock.text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  console.log(`[Writer Agent] ✓ Action: ${parsed.action} | Confidence: ${parsed.confidence}`);

  return {
    ticketId: ticket.id,
    response: parsed.response,
    action: parsed.action,
    confidence: parsed.confidence,
    resolvedAt: new Date().toISOString(),
  };
}