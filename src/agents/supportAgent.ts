import { claude } from "../lib/claude";
import { Ticket, TicketResolution } from "../types/ticket";

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

  const userMessage = `
Customer: ${ticket.customerName}
Subject: ${ticket.subject}
Priority: ${ticket.priority}

Message:
${ticket.body}
  `.trim();

  const response = await claude.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  // Extract the text content from the response
  const firstBlock = response.content[0];

  if (firstBlock.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  console.log(`[Tokens] Input: ${response.usage.input_tokens} | Output: ${response.usage.output_tokens}`);


  // Parse Claude's JSON response
  let parsed: {
    response: string;
    action: "resolved" | "escalated" | "needs_info";
    confidence: number;
    reasoning: string;
  };

  try {
    parsed = JSON.parse(firstBlock.text);
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${firstBlock.text}`);
  }

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