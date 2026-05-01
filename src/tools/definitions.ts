import Anthropic from "@anthropic-ai/sdk";

export const supportTools: Anthropic.Tool[] = [
  {
    name: "search_knowledge_base",
    description:
      "Search the company knowledge base for articles, FAQs, and known solutions. Use this when the ticket describes a technical issue or asks a question that may have a documented answer.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query — describe the issue or question in plain terms",
        },
        category: {
          type: "string",
          enum: ["login", "billing", "technical", "account", "general"],
          description: "The support category to filter results",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_customer_history",
    description:
      "Retrieve the support history for a customer — previous tickets, resolutions, and account status. Use this to check if this is a recurring issue or if the customer has an active incident.",
    input_schema: {
      type: "object",
      properties: {
        customer_id: {
          type: "string",
          description: "The unique customer ID",
        },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "check_system_status",
    description:
      "Check if there are any active system outages or incidents that could explain the customer's issue. Use this for login failures, performance issues, or when multiple customers report the same problem.",
    input_schema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          enum: ["auth", "dashboard", "api", "billing", "all"],
          description: "The service to check status for",
        },
      },
      required: ["service"],
    },
  },
];
