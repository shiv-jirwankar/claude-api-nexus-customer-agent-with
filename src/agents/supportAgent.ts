import Anthropic from "@anthropic-ai/sdk";
import { claude } from "../lib/claude";
import { Ticket, TicketResolution } from "../types/ticket";
import { supportTools } from "../tools/definitions";
import { executeTool } from "../tools/executor";

const SYSTEM_PROMPT = `You are a senior customer support specialist for a SaaS company called Nexus.

Your job is to read incoming support tickets and draft a helpful, professional response.

Guidelines:
- Be empathetic and clear
- If the issue is a known technical problem, provide step-by-step resolution steps
- If you cannot resolve it with certainty, say so honestly — do not guess
- Always end with a follow-up offer
- Keep responses concise — under 150 words

Respond in this exact JSON format:
{
  "response": "your drafted reply to the customer",
  "action": "resolved" | "escalated" | "needs_info",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief internal note on why you chose this action"
}`;

export async function handleTicket(ticket: Ticket): Promise<TicketResolution> {
  console.log(`[Agent] Processing ticket ${ticket.id}...`);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `
Customer: ${ticket.customerName}
Subject: ${ticket.subject}
Priority: ${ticket.priority}

Message:
${ticket.body}
  `.trim(),
    },
  ];

  let iterationCount = 0;
  let maxIterations = 10;

  while (iterationCount < maxIterations) {
    iterationCount++;
    console.log(`[Agent] Iteration ${iterationCount}...`);
    const response = await claude.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: supportTools,
      messages,
    });

    console.log(`[Agent] Claude Response is: ${JSON.stringify(response, null, 2)}`);

    console.log(`[Agent] stop reason: ${response.stop_reason}`);
    console.log(
      `[Tokens] Input: ${response.usage.input_tokens} | Output: ${response.usage.output_tokens}`,
    );

    // Case 1: Claude has made a decision and ended the turn
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((block) => block.type === "text");

      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text block in final response");
      }

      // Parse Claude's JSON response
      let parsed: {
        response: string;
        action: "resolved" | "escalated" | "needs_info";
        confidence: number;
        reasoning: string;
      };

      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        throw new Error(
          `Failed to parse Claude response as JSON: ${textBlock.text}`,
        );
      }

      console.log(
        `[Agent] ✓ Done — Action: ${parsed.action} | Confidence: ${parsed.confidence}`,
      );
      console.log(`[Agent] Reasoning: ${parsed.reasoning}`);

      return {
        ticketId: ticket.id,
        response: parsed.response,
        action: parsed.action,
        confidence: parsed.confidence,
        resolvedAt: new Date().toISOString(),
      };
    }

    // case 2: Claude wants to use a tool — execute it and feed results back in
    if (response.stop_reason === "tool_use") {
      // Add Claude's response (including tools_use blocks) to message history
      messages.push({
        role: "assistant",
        content: response.content,
      });

      // Process every tool Claude asked for in this turn
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        console.log(`[Tool] Calling: ${block.name}`);
        console.log(`[Tool] Input:`, JSON.stringify(block.input, null, 2));

        const result = await executeTool(
          block.name,
          block.input as Record<string, string>,
        );

        console.log(`[Tool] Result preview: ${result.substring(0, 80)}...`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      // Send all tool results back to Claude and let it continue the conversation
      messages.push({
        role: "user",
        content: toolResults,
      });

      continue; // go back to the top — Claude will process results
    }

    // ── Case 3: Unexpected stop reason ──
    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  }

  throw new Error(
    `Agent exceeded maximum iterations (${maxIterations}) without resolving ticket ${ticket.id}`,
  );
}
