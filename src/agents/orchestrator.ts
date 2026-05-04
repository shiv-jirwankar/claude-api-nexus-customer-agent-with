import Anthropic from "@anthropic-ai/sdk";
import { claude } from "../lib/claude";
import { Ticket, TicketResolution, OrchestratorPlan } from "../types/ticket";
import { runTriageAgent } from "./triageAgent";
import { runResearchAgent } from "./researchAgent";
import { runEscalationAgent } from "./escalationAgent";
import { runWriterAgent } from "./writerAgent";

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the orchestrator for a multi-agent customer 
support system. You receive a support ticket and decide the processing strategy.

You have four specialist agents available:
- triageAgent: classifies issue type and complexity
- researchAgent: searches knowledge base and tools for solutions  
- escalationAgent: decides if human intervention is needed
- writerAgent: drafts the final customer response

Think carefully about the ticket. Consider:
- How complex is this issue?
- Can research and escalation evaluation run in parallel?
- What is the risk if we get this wrong?
- Should we resolve autonomously or involve a human?

Respond with raw JSON only — no markdown, no code fences:
{
  "strategy": "brief description of your processing approach",
  "runResearchInParallel": true | false,
  "finalAction": "resolve" | "escalate" | "needs_info"
}`;

export async function runOrchestrator(ticket: Ticket): Promise<TicketResolution> {
  console.log(`\n[Orchestrator] ══════════════════════════════`);
  console.log(`[Orchestrator] Processing ticket ${ticket.id}`);
  console.log(`[Orchestrator] ══════════════════════════════`);

  // ── Step 1: Plan with extended thinking ───────────────────────
  // No tools here — just Claude reasoning about strategy
  // Plain messages.create() works fine, no beta header needed
  console.log(`\n[Orchestrator] Planning with extended thinking...`);

  const planResponse = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 5000,       // must be greater than budget_tokens
    thinking: {
      type: "enabled",
      budget_tokens: 3000,  // Claude can spend up to 3000 tokens reasoning
    },
    system: ORCHESTRATOR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `
Customer: ${ticket.customerName} (Plan: Pro)
Subject: ${ticket.subject}
Priority: ${ticket.priority}
Body: ${ticket.body}
        `.trim(),
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  // ── Extract thinking blocks and text response ─────────────────
  let orchestratorReasoning = "";
  let planText = "";

  for (const block of planResponse.content) {
    if (block.type === "thinking") {
      orchestratorReasoning = block.thinking || "[thinking omitted]";
      console.log(`\n[Orchestrator Thinking]\n${orchestratorReasoning}\n`);
    }
    if (block.type === "text") {
      planText = block.text;
    }
  }

  const cleaned = planText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const plan = JSON.parse(cleaned) as OrchestratorPlan;
  plan.reasoning = orchestratorReasoning;

  console.log(`[Orchestrator] Strategy: ${plan.strategy}`);
  console.log(`[Orchestrator] Parallel: ${plan.runResearchInParallel}`);
  console.log(`[Orchestrator] Planned action: ${plan.finalAction}`);

  // ── Step 2: Always run triage first ───────────────────────────
  const triage = await runTriageAgent(ticket);

  // ── Step 3: Research + escalation (parallel or sequential) ────
  let research, escalation;

  if (plan.runResearchInParallel) {
    console.log(`\n[Orchestrator] Running research + escalation in PARALLEL...`);

    [research, escalation] = await Promise.all([
      runResearchAgent(ticket, triage),
      runEscalationAgent(ticket, triage, {
        kbArticlesFound: [],
        proposedSolution: "Pending research",
        confidence: 0.5,
        additionalInfoNeeded: [],
      }),
    ]);

    // Re-evaluate escalation now that we have real research results
    if (research.confidence < 0.6 || research.additionalInfoNeeded.length > 0) {
      console.log(`[Orchestrator] Re-evaluating escalation with full research...`);
      escalation = await runEscalationAgent(ticket, triage, research);
    }
  } else {
    console.log(`\n[Orchestrator] Running research + escalation SEQUENTIALLY...`);
    research = await runResearchAgent(ticket, triage);
    escalation = await runEscalationAgent(ticket, triage, research);
  }

  // ── Step 4: Writer synthesizes everything ─────────────────────
  console.log(`\n[Orchestrator] Dispatching writer agent...`);
  const resolution = await runWriterAgent(ticket, triage, research, escalation);

  console.log(`\n[Orchestrator] ══════════════════════════════`);
  console.log(`[Orchestrator] ✓ Complete — Action: ${resolution.action}`);
  console.log(`[Orchestrator] ══════════════════════════════\n`);

  return resolution;
}