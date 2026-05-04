import Anthropic from "@anthropic-ai/sdk";
import { claude } from "../lib/claude";
import { Ticket, TriageResult } from "../types/ticket";

const SYSTEM_PROMPT = `You are a support ticket triage specialist. Your ONLY job is to 
classify incoming support tickets quickly and accurately.

Analyze the ticket and respond with raw JSON only — no markdown, no code fences:
{
  "category": "login" | "billing" | "technical" | "account" | "general",
  "complexity": "simple" | "moderate" | "complex",
  "estimatedResolutionTime": "e.g. 5 minutes / 1 hour / 1 day",
  "suggestedAction": "resolve" | "escalate" | "needs_info"
}

Classification rules:
- simple: known issue with documented solution, single user affected
- moderate: requires investigation, unclear root cause
- complex: data loss, security issue, affects multiple users, or no known solution
- escalate immediately: data loss, security breach, payment fraud, Enterprise SLA breach`;

export async function runTriageAgent(ticket: Ticket): Promise<TriageResult> {
  console.log(`[Triage Agent] Classifying ticket ${ticket.id}...`);

  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Subject: ${ticket.subject}\nPriority: ${ticket.priority}\n\n${ticket.body}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("[Triage Agent] No text response");
  }

  const cleaned = textBlock.text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const result: TriageResult = JSON.parse(cleaned);
  console.log(`[Triage Agent] ✓ Category: ${result.category} | Complexity: ${result.complexity}`);
  return result;
}