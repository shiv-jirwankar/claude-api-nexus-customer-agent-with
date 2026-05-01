// simulated tool handlers - in production these would call real APIs

export async function searchKnowledgeBase(
  query: string,
  category?: string,
): Promise<string> {
  console.log(
    `[Tool] search_knowledge_base: "${query}" | category: ${category}`,
  );

  // Simulated KB articles
  const articles: Record<string, string> = {
    login: `
KB-101: Login Issues
- Clear browser cache and cookies first
- Ensure Caps Lock is off
- Try incognito/private browsing mode
- If SSO is enabled, confirm your org's identity provider is reachable
- Password resets expire after 24 hours — if reset link is old, request a new one
- Contact support if MFA device is lost
    `.trim(),
    billing: `
KB-205: Billing & Subscription
- Invoices are generated on the 1st of each month
- Payment failures trigger a 3-day grace period before suspension
- To update payment method, go to Settings > Billing > Payment Methods
- Refund requests must be submitted within 30 days of charge
    `.trim(),
    technical: `
KB-312: API & Dashboard Performance
- Dashboard may load slowly during peak hours (9-11am IST, 2-4pm EST)
- API rate limits: 1000 req/min on Pro, 100 req/min on Free
- Clear local storage if dashboard shows stale data
- Check status.nexus.io for live incident updates
    `.trim(),
  };

  const key =
    category || (query.toLowerCase().includes("login") ? "login" : "technical");
  return (
    articles[key] ||
    "No specific article found. Recommend checking status.nexus.io or escalating to Tier 2."
  );
}

export async function getCustomerHistory(customerId: string): Promise<string> {
  console.log(`[Tool] get_customer_history: customer_id=${customerId}`);

  const history: Record<string, string> = {
    C123: `
Customer: Priya Sharma (C123) | Plan: Pro | Status: Active
Previous tickets:
- T089 (3 weeks ago): Slow dashboard — resolved, was a known incident
- T045 (2 months ago): Billing question — resolved quickly
No recurring issues. First login-related ticket.
    `.trim(),
  };

  return (
    history[customerId] ||
    `No history found for customer ${customerId}. May be a new customer.`
  );
}

export async function checkSystemStatus(service: string): Promise<string> {
  console.log(`[Tool] check_system_status: ${service}`);

  // Simulated system status
  const statuses: Record<string, string> = {
    auth: "AUTH SERVICE: All systems operational. Last incident: 12 days ago (resolved in 23 min).",
    dashboard: "DASHBOARD: Minor degradation reported. 3 users affected. Engineering investigating.",
    api: "API: Fully operational.",
    billing: "BILLING: Fully operational.",
    all: "Overall status: 1 minor incident active (dashboard). Auth, API, Billing all operational.",
  };

  return statuses[service] || statuses["all"];
}