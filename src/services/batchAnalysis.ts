import Anthropic from "@anthropic-ai/sdk";
import { claude } from "../lib/claude";
import { StoredTicket, TicketScore, KbGapReport } from "../types/ticket";

const SCORING_SYSTEM_PROMPT = `You are a quality assurance specialist for a customer 
support team. Evaluate the quality of a support ticket response.

Respond with raw JSON only — no markdown, no code fences:
{
  "qualityScore": 0-10,
  "accuracyScore": 0-10,
  "empathyScore": 0-10,
  "kbGaps": ["list of topics not covered in knowledge base"],
  "improvementSuggestions": ["specific ways to improve this response"],
  "category": "login|billing|technical|account|general"
}

Scoring guide:
- qualityScore: overall response quality (clarity, completeness, professionalism)
- accuracyScore: technical accuracy of the solution provided
- empathyScore: tone, acknowledgment of customer frustration, human warmth
- kbGaps: topics the agent struggled with that should have KB articles
- improvementSuggestions: concrete ways this specific response could be better`;

// ── Step 1: Submit all tickets as a single batch ──────────────
export async function submitScoringBatch(
  storedTickets: StoredTicket[],
): Promise<string> {
  console.log(
    `[Batch] Submitting ${storedTickets.length} tickets for scoring...`,
  );

  // Build one request per ticket — each gets a unique custom_id
  // custom_id is critical — it's how you map results back to tickets
  const requests: {
    custom_id: string;
    params: Anthropic.Messages.MessageCreateParamsNonStreaming;
  }[] = storedTickets.map((stored) => ({
    custom_id: `score-${stored.ticket.id}`, // must be unique per batch
    params: {
      model: "claude-haiku-4-5" as const, // cheaper model for batch scoring
      max_tokens: 1024,
      system: SCORING_SYSTEM_PROMPT,
      messages: [
        {
          role: "user" as const,
          content: `
ORIGINAL TICKET:
Customer: ${stored.ticket.customerName}
Subject: ${stored.ticket.subject}
Body: ${stored.ticket.body}

AGENT RESPONSE:
${stored.resolution.response}

ACTION TAKEN: ${stored.resolution.action}
CONFIDENCE: ${stored.resolution.confidence}
            `.trim(),
        },
      ],
    },
  }));

  const batch = await claude.messages.batches.create({
    requests: requests as any,
  });

  console.log(`[Batch] Created batch: ${batch.id}`);
  console.log(`[Batch] Status: ${batch.processing_status}`);
  console.log(`[Batch] Request counts:`, batch.request_counts);

  return batch.id;
}

// ── Step 2: Poll until batch completes ───────────────────────
export async function waitForBatch(
  batchId: string,
  pollIntervalMs = 5000,
): Promise<void> {
  console.log(
    `[Batch] Polling for completion (every ${pollIntervalMs / 1000}s)...`,
  );

  while (true) {
    const batch = await claude.messages.batches.retrieve(batchId);

    console.log(
      `[Batch] Status: ${batch.processing_status} | ` +
        `Processing: ${batch.request_counts.processing} | ` +
        `Succeeded: ${batch.request_counts.succeeded} | ` +
        `Errored: ${batch.request_counts.errored}`,
    );

    if (batch.processing_status === "ended") {
      console.log(`[Batch] ✓ Batch complete`);
      return;
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

// ── Step 3: Stream and collect results ───────────────────────
export async function collectBatchResults(
  batchId: string,
  storedTickets: StoredTicket[],
): Promise<TicketScore[]> {
  console.log(`[Batch] Collecting results for batch ${batchId}...`);

  // Build lookup map: custom_id → stored ticket
  const ticketMap = new Map<string, StoredTicket>();
  for (const stored of storedTickets) {
    ticketMap.set(`score-${stored.ticket.id}`, stored);
  }

  const scores: TicketScore[] = [];

  // Stream results as JSONL — memory efficient for large batches
  for await (const result of await claude.messages.batches.results(batchId)) {
    if (result.result.type !== "succeeded") {
      console.warn(
        `[Batch] Request ${result.custom_id} failed: ${result.result.type}`,
      );
      continue;
    }

    const textBlock = result.result.message.content.find(
      (b: Anthropic.ContentBlock) => b.type === "text",
    );

    if (!textBlock || textBlock.type !== "text") continue;

    const cleaned = textBlock.text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      const stored = ticketMap.get(result.custom_id);

      scores.push({
        ticketId: stored?.ticket.id || result.custom_id,
        qualityScore: parsed.qualityScore,
        accuracyScore: parsed.accuracyScore,
        empathyScore: parsed.empathyScore,
        kbGaps: parsed.kbGaps || [],
        improvementSuggestions: parsed.improvementSuggestions || [],
        category: parsed.category,
      });

      console.log(
        `[Batch] Scored ${result.custom_id}: ` +
          `Q=${parsed.qualityScore} A=${parsed.accuracyScore} E=${parsed.empathyScore}`,
      );
    } catch (err) {
      console.warn(`[Batch] Failed to parse result for ${result.custom_id}`);
    }
  }

  console.log(`[Batch] ✓ Collected ${scores.length} scores`);
  return scores;
}

// ── Step 4: Generate KB gap report from all scores ────────────
export async function generateKbGapReport(
  scores: TicketScore[],
  storedTickets: StoredTicket[],
): Promise<KbGapReport> {
  console.log(`[Batch] Generating KB gap report...`);

  // Aggregate all KB gaps across all tickets
  const allGaps = scores.flatMap((s) => s.kbGaps);
  const gapFrequency = allGaps.reduce<Record<string, number>>((acc, gap) => {
    acc[gap] = (acc[gap] || 0) + 1;
    return acc;
  }, {});

  const avgQuality =
    scores.reduce((sum, s) => sum + s.qualityScore, 0) / scores.length;

  // Use a single Claude call to synthesize the gap report
  // This is NOT a batch call — it's one synthesis call after batch completes
  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2048,
    system: `You are a knowledge base strategist. Analyze support ticket gaps and 
generate a prioritized report of missing KB articles.

Respond with raw JSON only — no markdown, no code fences:
{
  "topGaps": [
    {
      "topic": "topic name",
      "frequency": number,
      "suggestedArticleTitle": "KB article title",
      "suggestedContent": "brief outline of what the article should cover"
    }
  ],
  "agentPerformanceSummary": "2-3 sentence summary of agent performance"
}`,
    messages: [
      {
        role: "user",
        content: `
Total tickets analyzed: ${scores.length}
Average quality score: ${avgQuality.toFixed(1)}/10

Gap frequency map:
${JSON.stringify(gapFrequency, null, 2)}

Category breakdown:
${JSON.stringify(
  scores.reduce<Record<string, number>>((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1;
    return acc;
  }, {}),
  null,
  2,
)}

Low confidence tickets (action=escalated or confidence<0.7):
${storedTickets
  .filter(
    (t) => t.resolution.action === "escalated" || t.resolution.confidence < 0.7,
  )
  .map((t) => `- ${t.ticket.subject}`)
  .join("\n")}
        `.trim(),
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in gap report response");
  }

  const cleaned = textBlock.text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  return {
    generatedAt: new Date().toISOString(),
    totalTicketsAnalyzed: scores.length,
    topGaps: parsed.topGaps || [],
    overallQualityScore: parseFloat(avgQuality.toFixed(1)),
    agentPerformanceSummary: parsed.agentPerformanceSummary,
  };
}

// ── Full pipeline: submit → wait → collect → report ──────────
export async function runNightlyBatchAnalysis(
  storedTickets: StoredTicket[],
): Promise<KbGapReport> {
  if (storedTickets.length === 0) {
    throw new Error("No tickets to analyze");
  }

  console.log(`\n[Batch Pipeline] Starting nightly analysis...`);
  console.log(`[Batch Pipeline] Tickets to process: ${storedTickets.length}`);

  const batchId = await submitScoringBatch(storedTickets);
  await waitForBatch(batchId);
  const scores = await collectBatchResults(batchId, storedTickets);
  const report = await generateKbGapReport(scores, storedTickets);

  console.log(`\n[Batch Pipeline] ✓ Analysis complete`);
  console.log(
    `[Batch Pipeline] Overall quality: ${report.overallQualityScore}/10`,
  );
  console.log(`[Batch Pipeline] KB gaps found: ${report.topGaps.length}`);

  return report;
}
