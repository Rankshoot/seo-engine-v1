/**
 * Public entry-point for the contextual AI agent.
 * Routing is now handled entirely by the orchestrator which detects intent
 * from the user's prompt rather than relying solely on the current page URL.
 */
export { runOrchestratorAgent as runContextualAgent } from "@/features/ai-assistant/agent/orchestratorAgent";
