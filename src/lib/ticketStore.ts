import { StoredTicket, Ticket, TicketResolution } from "../types/ticket";

// In-memory store — replace with PostgreSQL/Redis in production
const store: StoredTicket[] = [];

export function saveResolution(ticket: Ticket, resolution: TicketResolution): void {
  store.push({
    ticket,
    resolution,
    resolvedAt: new Date().toISOString(),
  });
  console.log(`[Store] Saved ticket ${ticket.id} | Total stored: ${store.length}`);
}

export function getAllStoredTickets(): StoredTicket[] {
  return [...store];
}

export function getStoredTicketCount(): number {
  return store.length;
}

export function clearStore(): void {
  store.length = 0;
}