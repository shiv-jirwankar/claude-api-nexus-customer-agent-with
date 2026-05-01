// Ticket comes in
export interface Ticket {
  id: string;
  customerId: string;
  customerName: string;
  subject: string;
  body: string;
  priority: "low" | "medium" | "high";
  createdAt: Date;
}

// Ticket Resolution goes out
export interface TicketResolution {
    ticketId: string;
    response: string;
    action: "resolved" | "escalated" | "needs_info";
    confidence: number;
    resolvedAt: string;
} 

export interface AgentMessage {
    role: "user" | "assistant" | "system";
    content: string;
}