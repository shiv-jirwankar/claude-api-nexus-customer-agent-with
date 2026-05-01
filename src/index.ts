import express from "express";
import dotenv from "dotenv";
import { handleTicket } from "./agents/supportAgent";
import { Ticket } from "./types/ticket";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "nexus", timestamp: new Date().toISOString() });
});

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
    console.error("[Server] Error processing ticket:", error);
    res.status(500).json({ error: "Failed to process ticket" });
  }
});

app.listen(PORT, () => {
  console.log(`Nexus running on http://localhost:${PORT}`);
});