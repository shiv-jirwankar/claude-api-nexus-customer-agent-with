import Anthropic from "@anthropic-ai/sdk";
import { claude } from "../lib/claude";
import { Ticket, TicketResolution } from "../types/ticket";
import { supportTools } from "../tools/definitions";
import { executeTool } from "../tools/executor";

const SYSTEM_PROMPT = `You are a senior customer support specialist for a SaaS company called Nexus.

Before responding to any ticket you MUST use your tools in this order:
1. search_knowledge_base — find relevant solutions
2. get_customer_history — understand the customer's context
3. check_system_status — rule out infrastructure issues

Only after all three tool calls should you draft your final response.

Respond with this exact JSON in your final message:
{
  "response": "your drafted reply to the customer",
  "action": "resolved" | "escalated" | "needs_info",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief internal note on why you chose this action"
}`;

export async function handleTicket(ticket: Ticket): Promise<TicketResolution> {
  console.log(`\n[Agent] ── Processing ticket ${ticket.id} ──`);

  // This array grows with every iteration — it IS the conversation
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
  const MAX_ITERATIONS = 10; // safety cap — prevents runaway loops

  // ── The agentic loop ──────────────────────────────────────────
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n[Agent] Iteration ${iteration}`);

    const response = await claude.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: supportTools,
      messages,
    });

    console.log(`[Agent] stop_reason: ${response.stop_reason}`);
    console.log(`[Tokens] Input: ${response.usage.input_tokens} | Output: ${response.usage.output_tokens}`);

    // ── CASE 1: Claude is done — extract final answer ─────────
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");

      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text block found in final response");
      }

      let parsed: {
        response: string;
        action: "resolved" | "escalated" | "needs_info";
        confidence: number;
        reasoning: string;
      };

      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        throw new Error(`Could not parse Claude response as JSON:\n${textBlock.text}`);
      }

      console.log(`\n[Agent] ✓ Complete`);
      console.log(`[Agent] Action: ${parsed.action} | Confidence: ${parsed.confidence}`);
      console.log(`[Agent] Reasoning: ${parsed.reasoning}`);

      return {
        ticketId: ticket.id,
        response: parsed.response,
        action: parsed.action,
        confidence: parsed.confidence,
        resolvedAt: new Date().toISOString(),
      };
    }

    // ── CASE 2: Claude wants to use tools ─────────────────────
    if (response.stop_reason === "tool_use") {

      // Step A: add Claude's full response (tool_use blocks) to history
      // This is critical — Claude needs to see its own tool requests
      // in the history to understand what results belong to which call
      messages.push({
        role: "assistant",
        content: response.content,
      });

      // Step B: execute every tool Claude asked for in this turn
      // Claude can request multiple tools in a single iteration
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        console.log(`[Tool] → ${block.name}`);
        console.log(`[Tool]   input: ${JSON.stringify(block.input)}`);

        const result = await executeTool(
          block.name,
          block.input as Record<string, string>
        );

        console.log(`[Tool]   result: ${result.substring(0, 100)}...`);

        // Each result is matched back to its request via tool_use_id
        // This is how Claude knows which result belongs to which call
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,   // ← must match the block.id from above
          content: result,
        });
      }

      // Step C: send all results back in a single user turn
      messages.push({
        role: "user",
        content: toolResults,
      });

      // Step D: loop back — Claude will read results and decide next step
      continue;
    }

    // ── CASE 3: Something unexpected ──────────────────────────
    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  }

  throw new Error(`Agent hit maximum iterations (${MAX_ITERATIONS}) — possible loop`);
}