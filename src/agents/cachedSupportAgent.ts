import Anthropic from "@anthropic-ai/sdk";
import { claude } from "../lib/claude";
import { Ticket, TicketResolution } from "../types/ticket";
import { supportTools } from "../tools/definitions";
import { executeTool } from "../tools/executor";
import { uploadKnowledgeBaseFile } from "../lib/filesService";
import path from "path";
import fs from "fs";

// KB file IDs — loaded once at startup, reused across all ticket calls
let kbFileIds: { policies: string; solutions: string } | null = null;

async function getKbFileIds() {
  if (kbFileIds) return kbFileIds;

  console.log("[Cached Agent] Loading KB files into Files API...");

  const policiesPath = path.join(process.cwd(), "kb", "general-policies.md");
  const solutionsPath = path.join(
    process.cwd(),
    "kb",
    "technical-solutions.md",
  );

  const [policiesId, solutionsId] = await Promise.all([
    uploadKnowledgeBaseFile(policiesPath),
    uploadKnowledgeBaseFile(solutionsPath),
  ]);

  kbFileIds = { policies: policiesId, solutions: solutionsId };
  console.log("[Cached Agent] KB files ready:", kbFileIds);
  return kbFileIds;
}

export async function handleTicketCached(
  ticket: Ticket,
  attachmentFileId?: string,
): Promise<TicketResolution> {
  console.log(`\n[Cached Agent] ── Processing ticket ${ticket.id} ──`);

  // Load KB file IDs (uploaded once, reused forever)
  const fileIds = await getKbFileIds();

  // ── System prompt as ARRAY — required for cache_control ──────
  // cache_control on the last block tells Claude to cache everything
  // up to and including that block. Both blocks get cached together.
  const systemPrompt: Anthropic.Beta.BetaTextBlockParam[] = [
    {
      type: "text",
      text: `You are a senior customer support specialist for a SaaS company called Nexus.

Before responding to any ticket you MUST use your tools in this order:
1. search_knowledge_base — find relevant solutions
2. get_customer_history — understand the customer's context
3. check_system_status — rule out infrastructure issues

The knowledge base documents attached to this prompt contain all official 
policies and technical solutions. Always reference them in your response.

Respond with this exact JSON in your final message:
{
  "response": "your drafted reply to the customer",
  "action": "resolved" | "escalated" | "needs_info",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief internal note on why you chose this action"
}`,
    },
    {
      type: "text",
      // Read KB content directly — Files API handles delivery to Claude
      text: `Knowledge Base Content:\n\n${fs.readFileSync(
        path.join(process.cwd(), "kb", "general-policies.md"),
        "utf-8",
      )}\n\n${fs.readFileSync(
        path.join(process.cwd(), "kb", "technical-solutions.md"),
        "utf-8",
      )}`,
      // ← This is the cache breakpoint — everything above gets cached
      // On the first call: cache_creation_input_tokens will be non-zero
      // On subsequent calls: cache_read_input_tokens will be non-zero (90% cheaper)
      cache_control: { type: "ephemeral" },
    },
  ];

  // Build the user message — optionally include a file attachment
  const userContent: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: "text",
      text: `
Customer: ${ticket.customerName} (ID: ${ticket.customerId})
Subject: ${ticket.subject}
Priority: ${ticket.priority}

Message:
${ticket.body}
      `.trim(),
    },
  ];

  // If customer attached a file (PDF, screenshot etc), reference it by file_id
  if (attachmentFileId) {
    userContent.push({
      type: "document",
      source: {
        type: "file",
        file_id: attachmentFileId,
      },
    } as Anthropic.Beta.BetaRequestDocumentBlock);
    console.log(`[Cached Agent] Including attachment: ${attachmentFileId}`);
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: userContent },
  ];

  let iteration = 0;
  const MAX_ITERATIONS = 10;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n[Cached Agent] Iteration ${iteration}`);

    // ── Use client.beta.messages — required for Files API ───────
    const response = await (claude as Anthropic).beta.messages.create(
      {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: systemPrompt,
        tools: supportTools,
        messages,
      },
      {
        headers: {
          "anthropic-beta": "files-api-2025-04-14",
        },
      },
    );

    // ── Log cache metrics — this is the money shot ───────────────
    const usage = response.usage as Anthropic.Beta.BetaUsage;
    console.log(`[Tokens] Input: ${usage.input_tokens}`);
    console.log(
      `[Cache]  Write: ${usage.cache_creation_input_tokens ?? 0} tokens (paid 1.25x)`,
    );
    console.log(
      `[Cache]  Read:  ${usage.cache_read_input_tokens ?? 0} tokens (paid 0.1x)`,
    );
    console.log(`[Tokens] Output: ${usage.output_tokens}`);
    console.log(`[Agent]  stop_reason: ${response.stop_reason}`);

    // ── CASE 1: Done ─────────────────────────────────────────────
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text block in final response");
      }

      let parsed: {
        response: string;
        action: "resolved" | "escalated" | "needs_info";
        confidence: number;
        reasoning: string;
      };

      try {
        // Strip markdown code fences if Claude wrapped the JSON
        const cleaned = textBlock.text
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();

        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error(`Failed to parse response: ${textBlock.text}`);
      }

      console.log(
        `\n[Cached Agent] ✓ Done — Action: ${parsed.action} | Confidence: ${parsed.confidence}`,
      );

      return {
        ticketId: ticket.id,
        response: parsed.response,
        action: parsed.action,
        confidence: parsed.confidence,
        resolvedAt: new Date().toISOString(),
      };
    }

    // ── CASE 2: Tool use ──────────────────────────────────────────
    if (response.stop_reason === "tool_use") {
      messages.push({
        role: "assistant",
        content: response.content as Anthropic.Beta.BetaContentBlockParam[],
      });

      const toolResults: Anthropic.Beta.BetaToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        console.log(`[Tool] → ${block.name}: ${JSON.stringify(block.input)}`);

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

    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  }

  throw new Error(`Max iterations reached (${MAX_ITERATIONS})`);
}
