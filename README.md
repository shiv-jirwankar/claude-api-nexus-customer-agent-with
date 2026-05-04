# Nexus — Enterprise Customer Support AI Agent

> A production-grade, multi-agent customer support SaaS built with TypeScript and the Anthropic Claude API. Designed as a portfolio project demonstrating the full breadth of Claude API capabilities for enterprise AI engineering.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Claude API Features Used](#claude-api-features-used)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Agent System](#agent-system)
- [Build Steps](#build-steps)
- [Tech Stack](#tech-stack)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)

---

## Overview

Nexus is a customer support AI agent SaaS that enterprise clients plug into their existing support channels. When a customer submits a ticket, Nexus autonomously handles tier-1 support — searching knowledge bases, checking system status, reviewing customer history, and drafting accurate, empathetic responses. Complex cases are escalated to human agents with full context summaries.

**Business value for enterprise clients:**
- Reduces support costs by 40–60%
- 24/7 availability without overnight staffing
- Learns from your company's specific policies and tone
- Integrates with Zendesk, Jira, Slack, and email
- Per-ticket or per-seat recurring revenue model

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT REQUEST                       │
│              (Webhook / REST API / Scheduled Job)           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS HTTP SERVER                      │
│  POST /tickets        POST /tickets/stream                  │
│  POST /tickets/cached POST /tickets/orchestrated            │
│  POST /batch/analyze  GET  /batch/status                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │  LIVE PATH  │  │ CACHED PATH │  │ BATCH PATH  │
   │             │  │             │  │             │
   │ Single-turn │  │ Files API + │  │  Nightly    │
   │ + Streaming │  │   Prompt    │  │  scoring +  │
   │   + Tools   │  │   Caching   │  │ KB gap      │
   └──────┬──────┘  └──────┬──────┘  │  analysis   │
          │                │         └──────┬──────┘
          └────────────────┘                │
                   │                        │
                   ▼                        ▼
     ┌─────────────────────────┐   ┌──────────────────┐
     │    ORCHESTRATOR AGENT   │   │   BATCH ANALYSIS │
     │  (Extended Thinking)    │   │     SERVICE      │
     └────────────┬────────────┘   └──────────────────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
┌─────────┐ ┌──────────┐ ┌──────────┐
│ TRIAGE  │ │RESEARCH  │ │ESCALATION│
│  AGENT  │ │  AGENT   │ │  AGENT   │
└────┬────┘ └────┬─────┘ └────┬─────┘
     └───────────┼─────────────┘
                 ▼
          ┌─────────────┐
          │   WRITER    │
          │    AGENT    │
          └─────────────┘
```

---

## Claude API Features Used

Every major Claude API capability is used in this project. Here is exactly where each one appears:

| Feature | Where Used | Why |
|---|---|---|
| **Messages API** | `supportAgent.ts` | Core single-turn ticket handling |
| **Tool Use + Agentic Loop** | `supportAgent.ts` | KB search, history lookup, status checks |
| **Streaming** | `supportAgentStream.ts` | Real-time SSE response to customers |
| **Files API** | `filesService.ts` + `cachedSupportAgent.ts` | Upload KB docs once, reference by `file_id` |
| **Prompt Caching** | `cachedSupportAgent.ts` | Cache system prompt + KB for 90% input cost reduction |
| **Extended Thinking** | `orchestrator.ts` | Orchestrator reasons about routing strategy |
| **Multi-Agent Orchestration** | `orchestrator.ts` + all agents | Triage → Research → Escalation → Writer pipeline |
| **Batch API** | `batchAnalysis.ts` | Nightly ticket scoring at 50% cost reduction |
| **Structured JSON Output** | All agents | Typed responses using JSON mode + Zod validation |
| **Vision / File Attachments** | `cachedSupportAgent.ts` | Customer-attached PDFs/screenshots via Files API |

---

## Project Structure

```
nexus/
├── src/
│   ├── agents/
│   │   ├── supportAgent.ts          # Step 2/3: single-turn + tool use loop
│   │   ├── supportAgentStream.ts    # Step 4: streaming SSE agent
│   │   ├── cachedSupportAgent.ts    # Step 5: Files API + prompt caching
│   │   ├── triageAgent.ts           # Step 6: classifies issue type + complexity
│   │   ├── researchAgent.ts         # Step 6: KB search + tool use loop
│   │   ├── escalationAgent.ts       # Step 6: decides human escalation
│   │   ├── writerAgent.ts           # Step 6: drafts final customer response
│   │   └── orchestrator.ts          # Step 6: extended thinking + coordination
│   ├── lib/
│   │   ├── claude.ts                # Shared Anthropic client instance
│   │   ├── filesService.ts          # Files API upload + reference management
│   │   └── ticketStore.ts           # In-memory ticket store (replace w/ DB)
│   ├── services/
│   │   └── batchAnalysis.ts         # Step 7: Batch API pipeline
│   ├── tools/
│   │   ├── definitions.ts           # Tool schemas (input_schema + descriptions)
│   │   ├── handlers.ts              # Mock tool implementations
│   │   └── executor.ts              # Tool router
│   ├── types/
│   │   └── ticket.ts                # Shared TypeScript interfaces
│   └── index.ts                     # Express server + route registration
├── kb/
│   ├── general-policies.md          # Support policies (uploaded via Files API)
│   └── technical-solutions.md      # Technical KB (uploaded via Files API)
├── .env
├── .gitignore
├── tsconfig.json
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key from [console.anthropic.com](https://console.anthropic.com)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/nexus-customer-agent-support
cd nexus-customer-agent-support

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
```

### Run in development

```bash
npm run dev
```

Server starts at `http://localhost:3000`. Verify with:

```bash
curl http://localhost:3000/health
```

---

## API Reference

### `POST /tickets`
Single-turn ticket processing. Claude reads the ticket and responds in one call.

```bash
curl -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "id": "T001",
    "customerId": "C123",
    "customerName": "Priya Sharma",
    "subject": "Cannot login to dashboard",
    "body": "Getting invalid credentials even after password reset.",
    "priority": "high",
    "createdAt": "2025-04-30T09:00:00Z"
  }'
```

---

### `POST /tickets/stream`
Streaming SSE response. Claude's reply arrives token-by-token via Server-Sent Events.

```bash
curl -X POST http://localhost:3000/tickets/stream \
  -H "Content-Type: application/json" \
  --no-buffer \
  -d '{ ...ticket payload... }'
```

**SSE events emitted:**

| Event | Payload | Description |
|---|---|---|
| `tool_start` | `{ tool, input }` | Agent calling a tool |
| `tool_done` | `{ tool, duration, preview }` | Tool completed |
| `response_start` | `{ ticketId }` | Final response starting |
| `text_delta` | `{ text }` | One chunk of streamed text |
| `response_done` | `{ ticketId, totalTokens }` | Stream complete |

---

### `POST /tickets/cached`
Same as `/tickets` but uses prompt caching and Files API. System prompt + KB content cached after first call — 90% cheaper on subsequent calls.

---

### `POST /tickets/orchestrated`
Full multi-agent pipeline with extended thinking. Best quality, highest cost.

```
Orchestrator (extended thinking) → Triage → Research + Escalation → Writer
```

All resolved tickets are automatically stored for nightly batch analysis.

---

### `POST /tickets/cached/with-attachment`
Handles customer file attachments (PDF, screenshots). Upload once via Files API, reference by `file_id`.

```bash
curl -X POST http://localhost:3000/tickets/cached/with-attachment \
  -H "Content-Type: application/json" \
  -d '{
    "id": "T004",
    "customerId": "C123",
    "customerName": "Priya Sharma",
    "subject": "Billing error - see attached invoice",
    "body": "I was charged twice. See the attached invoice PDF.",
    "priority": "high",
    "createdAt": "2025-04-30T09:00:00Z",
    "attachment": {
      "base64": "<base64-encoded-file>",
      "filename": "invoice-april.pdf",
      "mimeType": "application/pdf"
    }
  }'
```

---

### `GET /batch/status`
Returns count of tickets stored and ready for batch analysis.

---

### `POST /batch/analyze`
Triggers nightly batch analysis pipeline:
1. Submits all stored tickets to Batch API (50% cost discount)
2. Polls until batch completes
3. Streams and collects all scores
4. Generates KB gap report

**Response — `KbGapReport`:**

```json
{
  "generatedAt": "2025-04-30T12:00:00Z",
  "totalTicketsAnalyzed": 25,
  "overallQualityScore": 7.8,
  "agentPerformanceSummary": "Agent handles login and billing well...",
  "topGaps": [
    {
      "topic": "Enterprise data recovery",
      "frequency": 4,
      "suggestedArticleTitle": "KB-401: Enterprise Data Recovery Procedures",
      "suggestedContent": "Steps for emergency data recovery, SLA commitments..."
    }
  ]
}
```

---

## Agent System

### Tool Definitions

Agents have access to three tools. Each tool's description drives Claude's decision on when to call it — write descriptions precisely.

| Tool | When Claude calls it | Returns |
|---|---|---|
| `search_knowledge_base` | Issue has a documented solution | Relevant KB articles |
| `get_customer_history` | Need context on repeat issues | Previous tickets + account status |
| `check_system_status` | Login failures, performance issues | Live service status |

### Agentic Loop Pattern

All agents (except triage and writer) run the same core loop:

```typescript
while (stopReason !== "end_turn") {
  const response = await claude.messages.stream({ tools, messages });
  
  if (response.stop_reason === "tool_use") {
    // Execute tools, append results to messages, continue
  }
  
  if (response.stop_reason === "end_turn") {
    // Parse final JSON response, return typed result
  }
}
```

### Prompt Caching Strategy

The KB content and system prompt are cached at the second system block using `cache_control: { type: "ephemeral" }`. After the first call:

```
First call:   cache_creation_input_tokens: 1240  (paid at 1.25x)
All others:   cache_read_input_tokens: 1240       (paid at 0.1x)
```

Cost reduction: **90% on input tokens** for all subsequent tickets.

---

## Build Steps

This project was built step-by-step as a learning progression:

| Step | Feature | Key Concept |
|---|---|---|
| 1 | Project scaffold | TypeScript + Express + folder structure |
| 2 | First Claude API call | Messages API, system prompt, typed response |
| 3 | Agentic loop + tool use | `while stop_reason !== end_turn`, tool schemas |
| 4 | Streaming | `messages.stream()`, SSE, `text_delta` events |
| 5 | Files API + prompt caching | `files.upload()`, `cache_control`, 90% cost cut |
| 6 | Multi-agent orchestration | Extended thinking, parallel agents, `Promise.all` |
| 7 | Batch API | Async batch, polling, `custom_id` mapping, 50% cost cut |
| 8 | Production hardening | Token tracking, audit log, retry logic, deployment |

---

## Tech Stack

| Package | Purpose |
|---|---|
| `@anthropic-ai/sdk` | Claude API — all agent calls |
| `express` | HTTP server + route handling |
| `dotenv` | Environment variable management |
| `zod` | TypeScript-first schema validation |
| `typescript` | Type safety throughout |
| `ts-node-dev` | Dev server with hot reload |

---

## Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-...      # Required — from console.anthropic.com
PORT=3000                          # Optional — defaults to 3000
```

---

## Deployment

### Build for production

```bash
npm run build
npm start
```

### Deploy to Render

1. Connect your GitHub repo to [render.com](https://render.com)
2. Set **Build Command:** `npm install && npm run build`
3. Set **Start Command:** `npm start`
4. Add `ANTHROPIC_API_KEY` as an environment variable
5. Deploy

### Deploy to Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Set `ANTHROPIC_API_KEY` in Railway's environment variables dashboard.

---

## Roadmap

- [ ] PostgreSQL persistence for ticket store
- [ ] Zendesk / Jira webhook integration
- [ ] Slack MCP integration for real-time notifications
- [ ] Multi-tenant support (per-client KB isolation)
- [ ] Analytics dashboard (Next.js)
- [ ] Human-in-the-loop escalation UI
- [ ] Fine-tuning pipeline from feedback loop
- [ ] Rate limiting + API key authentication

---

## License

MIT — built as a portfolio project for EPAM AI engineering assessment.