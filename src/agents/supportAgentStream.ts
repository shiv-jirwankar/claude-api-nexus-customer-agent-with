import Anthropic from "@anthropic-ai/sdk";
import { Response } from "express";
import { claude } from "../lib/claude";
import { Ticket } from "../types/ticket";
import { supportTools } from "../tools/definitions";
import { executeTool } from "../tools/executor";

const SYSTEM_PROMPT = `You are a senior customer support specialist for a SaaS company called Nexus.

Before responding to any ticket you MUST use your tools in this order:
1. search_knowledge_base — find relevant solutions
2. get_customer_history — understand the customer's context
3. check_system_status — rule out infrastructure issues

After gathering information, write a helpful empathetic response directly to the customer.
Be clear and concise — under 150 words. Write as natural prose, not JSON.`;

function sendEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function handleTicketStream(
  ticket: Ticket,
  res: Response
): Promise<void> {
  console.log(`\n[Stream Agent] ── Processing ticket ${ticket.id} ──`);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `
Customer: ${ticket.customerName} (ID: ${ticket.customerId})
Subject: ${ticket.subject}
Priority: ${ticket.priority}

Message:
${ticket.body}
      `.trim(),
    },
  ];

  let iteration = 0;
  const MAX_ITERATIONS = 10;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n[Stream Agent] Iteration ${iteration}`);

    // ── Use stream() for EVERY iteration, not just the final one ──
    // The SDK streams tool_use blocks AND text deltas in the same call
    const stream = claude.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: supportTools,
      messages,
    });

    // ── Stream text deltas in real time as they arrive ─────────
    // This fires on every text chunk — including mid-tool-use thinking text
    stream.on("text", (text) => {
      process.stdout.write(text);
      sendEvent(res, "text_delta", { text });
    });

    // ── Wait for the full response to accumulate ────────────────
    // finalMessage() collects all streamed events into a complete
    // Message object — same shape as messages.create() returns
    const response = await stream.finalMessage();

    console.log(`\n[Stream Agent] stop_reason: ${response.stop_reason}`);
    console.log(`[Tokens] Input: ${response.usage.input_tokens} | Output: ${response.usage.output_tokens}`);

    // ── CASE 1: Claude is done ──────────────────────────────────
    if (response.stop_reason === "end_turn") {
      sendEvent(res, "response_done", {
        ticketId: ticket.id,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      });
      res.end();
      return;
    }

    // ── CASE 2: Claude wants tools — same as before ─────────────
    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        console.log(`[Tool] → ${block.name}: ${JSON.stringify(block.input)}`);

        sendEvent(res, "tool_start", {
          tool: block.name,
          input: block.input,
        });

        const startTime = Date.now();
        const result = await executeTool(
          block.name,
          block.input as Record<string, string>
        );
        const duration = Date.now() - startTime;

        sendEvent(res, "tool_done", {
          tool: block.name,
          duration,
          preview: result.substring(0, 120),
        });

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

  throw new Error(`Agent hit maximum iterations (${MAX_ITERATIONS})`);
}