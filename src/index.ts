import express from "express";
import dotenv from "dotenv";
import { handleTicket } from "./agents/supportAgent";
import { handleTicketStream } from "./agents/supportAgentStream";
import { handleTicketCached } from "./agents/cachedSupportAgent";
import { uploadCustomerAttachment } from "./lib/filesService";
import { Ticket } from "./types/ticket";
import { runOrchestrator } from "./agents/orchestrator";
import { saveResolution } from "./lib/ticketStore";
import { runNightlyBatchAnalysis } from "./services/batchAnalysis";
import { getAllStoredTickets, getStoredTicketCount } from "./lib/ticketStore";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "nexus",
    timestamp: new Date().toISOString(),
  });
});

// Step 2 route — basic single-turn
app.post("/tickets", async (req, res) => {
  try {
    const ticket = req.body as Ticket;
    if (!ticket.id || !ticket.body || !ticket.customerName) {
      res.status(400).json({ error: "Missing required ticket fields" });
      return;
    }
    const resolution = await handleTicket(ticket);
    res.json(resolution);
  } catch (error) {
    console.error("[Server] Error:", error);
    res.status(500).json({ error: "Failed to process ticket" });
  }
});

// Step 4 route — streaming via SSE
app.post("/tickets/stream", async (req, res) => {
  try {
    const ticket = req.body as Ticket;
    if (!ticket.id || !ticket.body || !ticket.customerName) {
      res.status(400).json({ error: "Missing required ticket fields" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    await handleTicketStream(ticket, res);
  } catch (error) {
    console.error("[Server] Streaming error:", error);
    res.write(
      `event: error\ndata: ${JSON.stringify({ error: "Stream failed" })}\n\n`,
    );
    res.end();
  }
});

// Step 5 route — with prompt caching + Files API
app.post("/tickets/cached", async (req, res) => {
  try {
    const ticket = req.body as Ticket;
    if (!ticket.id || !ticket.body || !ticket.customerName) {
      res.status(400).json({ error: "Missing required ticket fields" });
      return;
    }
    const resolution = await handleTicketCached(ticket);
    res.json(resolution);
  } catch (error) {
    console.error("[Server] Error:", error);
    res.status(500).json({ error: "Failed to process ticket" });
  }
});

// Step 5 route — with file attachment
app.post("/tickets/cached/with-attachment", async (req, res) => {
  try {
    const { attachment, ...ticketData } = req.body;
    const ticket = ticketData as Ticket;

    if (!ticket.id || !ticket.body || !ticket.customerName) {
      res.status(400).json({ error: "Missing required ticket fields" });
      return;
    }

    let attachmentFileId: string | undefined;

    if (attachment?.base64 && attachment?.filename) {
      const fileBuffer = Buffer.from(attachment.base64, "base64");
      attachmentFileId = await uploadCustomerAttachment(
        fileBuffer,
        attachment.filename,
        attachment.mimeType || "application/pdf",
      );
    }

    const resolution = await handleTicketCached(ticket, attachmentFileId);
    res.json(resolution);
  } catch (error) {
    console.error("[Server] Error:", error);
    res.status(500).json({ error: "Failed to process ticket" });
  }
});

// Debug helper — remove in production
console.log("Registered routes:");
(app as any)._router?.stack
  ?.filter((r: any) => r.route)
  ?.forEach((r: any) => {
    console.log(
      `  ${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`,
    );
  });

// Update the orchestrated route to save results
app.post("/tickets/orchestrated", async (req, res) => {
  try {
    const ticket = req.body as Ticket;
    if (!ticket.id || !ticket.body || !ticket.customerName) {
      res.status(400).json({ error: "Missing required ticket fields" });
      return;
    }
    const resolution = await runOrchestrator(ticket);

    // Save to store for nightly batch analysis
    saveResolution(ticket, resolution);

    res.json(resolution);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Server] Orchestrator error:", message);
    res.status(500).json({ error: message });
  }
});

// Check how many tickets are stored and ready for analysis
app.get("/batch/status", (_req, res) => {
  res.json({
    storedTickets: getStoredTicketCount(),
    message: `${getStoredTicketCount()} tickets ready for batch analysis`,
  });
});

// Trigger nightly batch analysis manually
// In production this would be a cron job (e.g. node-cron at midnight)
app.post("/batch/analyze", async (req, res) => {
  try {
    const tickets = getAllStoredTickets();

    if (tickets.length === 0) {
      res.status(400).json({
        error: "No tickets stored yet. Process some tickets via /tickets/orchestrated first.",
      });
      return;
    }

    console.log(`[Server] Starting batch analysis for ${tickets.length} tickets...`);
    const report = await runNightlyBatchAnalysis(tickets);
    res.json(report);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Server] Batch error:", message);
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`\nNexus running on http://localhost:${PORT}`);
});

