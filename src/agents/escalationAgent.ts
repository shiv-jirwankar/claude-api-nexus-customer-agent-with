import { claude } from "../lib/claude";
import { Ticket, TriageResult, ResearchResult, EscalationResult } from "../types/ticket";

const SYSTEM_PROMPT = `You are an escalation decision specialist. Based on ticket details, 
triage results, and research findings, decide if this ticket needs human intervention.

Respond with raw JSON only — no markdown, no code fences:
{
  "shouldEscalate": true | false,
  "reason": "clear explanation of the escalation decision",
  "priority": "low" | "medium" | "high" | "critical",
  "suggestedTeam": "e.g. Tier-2 Technical / Billing Team / Security Team / Customer Success"
}

Escalate when:
- Research confidence is below 0.6
- Issue involves data loss, security, or payment fraud
- Customer has 3+ previous unresolved tickets on same issue
- Complexity is 'complex' and no clear solution exists
- Customer is on Enterprise plan with active SLA`;

export async function runEscalationAgent(
  ticket: Ticket,
  triage: TriageResult,
  research: ResearchResult
): Promise<EscalationResult> {
  console.log(`[Escalation Agent] Evaluating ticket ${ticket.id}...`);

  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `
Ticket: ${ticket.subject}
Priority: ${ticket.priority}
Body: ${ticket.body}

Triage: ${JSON.stringify(triage)}
Research confidence: ${research.confidence}
Proposed solution: ${research.proposedSolution}
Additional info needed: ${JSON.stringify(research.additionalInfoNeeded)}
        `.trim(),
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("[Escalation Agent] No text response");
  }

  const cleaned = textBlock.text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const result: EscalationResult = JSON.parse(cleaned);
  console.log(`[Escalation Agent] ✓ Escalate: ${result.shouldEscalate} | Priority: ${result.priority}`);
  return result;
}