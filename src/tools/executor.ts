import { checkSystemStatus, getCustomerHistory, searchKnowledgeBase } from "./handlers";

export async function executeTool(toolName: string, toolInput: Record<string, string>): Promise<string> {
    switch(toolName) {
        case "search_knowledge_base":
            return await searchKnowledgeBase(toolInput.query, toolInput.category);
        case "get_customer_history":
            return await getCustomerHistory(toolInput.customerId);
        case "check_system_status":
            return await checkSystemStatus(toolInput.service);
        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}