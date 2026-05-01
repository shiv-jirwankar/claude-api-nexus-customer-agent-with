# Nexus Customer Support Agent

This repository is a portfolio and learning project demonstrating how to integrate Claude Gen AI into a production-style Node.js/TypeScript app.

`Nexus` is a simple customer support agent that reads incoming tickets and returns a drafted response, a support action, and confidence reasoning using Claude via the `@anthropic-ai/sdk`.

## Features

- Receives support tickets via HTTP POST
- Sends ticket content to Claude for response generation
- Parses Claude-generated JSON into a structured ticket resolution
- Returns `response`, `action`, `confidence`, and `reasoning`

## Tech stack

- Node.js + TypeScript
- Express web server
- Claude / Anthropic SDK for AI generation
- dotenv for environment variable configuration

## Project structure

- `src/index.ts` - Express server and `/tickets` endpoint
- `src/agents/supportAgent.ts` - Ticket handling and Claude API integration
- `src/lib/claude.ts` - Anthropic client setup
- `src/types/ticket.ts` - Ticket and resolution interfaces

## Getting started

### Prerequisites

- Node.js installed
- An Anthropic API key

### Install dependencies

```bash
npm install
```

### Environment variables

Create a `.env` file in the project root with:

```env
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
```

### Run in development

```bash
npm run dev
```

### Build and run production

```bash
npm run build
npm start
```

## API

### POST /tickets

Submit a ticket payload to generate a customer support response.

#### Request body

```json
{
  "id": "T001",
  "customerId": "C123",
  "customerName": "Priya Sharma",
  "subject": "Cannot login to dashboard",
  "body": "I have been trying to login since morning but it keeps saying invalid credentials. I already reset my password twice.",
  "priority": "high",
  "createdAt": "2025-04-30T09:00:00Z"
}
```

#### Response body

```json
{
  "ticketId": "T001",
  "response": "...",
  "action": "resolved",
  "confidence": 0.92,
  "resolvedAt": "2026-05-01T12:34:56.789Z"
}
```

## Notes

- The agent expects the Claude response to be valid JSON in a predefined format.
- If Claude returns invalid JSON or the API request fails, the server currently returns a `500` error.
- This project is designed to demonstrate integration patterns rather than a production-ready support system.

## License

This project is provided as-is for learning and portfolio use.
