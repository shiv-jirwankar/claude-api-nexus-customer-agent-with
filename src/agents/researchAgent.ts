import Anthropic from "@anthropic-ai/sdk";
import { claude } from "../lib/claude";
import { Ticket, TriageResult, ResearchResult } from "../types/ticket";
import { supportTools } from "../tools/definitions";
import { executeTool } from "../tools/executor";
import fs from "fs";
import path from "path";

const buildSystemPrompt = () => {
  const policies = fs.readFileSync(
    path.join(process.cwd(), "kb", "general-policies.md"),
    "utf-8",
  );
  const solutions = fs.readFileSync(
    path.join(process.cwd(), "kb", "technical-solutions.md"),
    "utf-8",
  );

  return [
    {
      type: "text" as const,
      text: `You are a technical support researcher. Your job is to find the best 
solution for a support ticket using the knowledge base and available tools.

After researching, respond with raw JSON only — no markdown, no code fences:
{
  "kbArticlesFound": ["list of relevant KB article IDs or titles"],
  "proposedSolution": "detailed step-by-step solution",
  "confidence": 0.0 to 1.0,
  "additionalInfoNeeded": ["list any info still needed, empty array if none"]
}`,
    },
    {
      type: "text" as const,
      text: `Knowledge Base:\n\n${policies}\n\n${solutions}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];
};

export async function runResearchAgent(
  ticket: Ticket,
  triage: TriageResult,
): Promise<ResearchResult> {
  console.log(`[Research Agent] Researching ticket ${ticket.id}...`);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `
Category: ${triage.category} | Complexity: ${triage.complexity}
Subject: ${ticket.subject}
Customer: ${ticket.customerName} (ID: ${ticket.customerId})

${ticket.body}
      `.trim(),
    },
  ];

  let iteration = 0;
  const MAX_ITERATIONS = 6;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const response = await claude.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: buildSystemPrompt(),
      tools: supportTools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("[Research Agent] No text response");
      }

      const cleaned = textBlock.text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      const result: ResearchResult = JSON.parse(cleaned);
      console.log(
        `[Research Agent] ✓ Confidence: ${result.confidence} | Articles: ${result.kbArticlesFound.length}`,
      );
      return result;
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        console.log(`[Research Agent] Tool: ${block.name}`);
        const result = await executeTool(
          block.name,
          block.input as Record<string, string>,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    throw new Error(
      `[Research Agent] Unexpected stop_reason: ${response.stop_reason}`,
    );
  }

  throw new Error("[Research Agent] Max iterations reached");
}
