import type { LLMProvider, LLMResearchContextPacket } from "@/lib/llm/llmTypes";
import { providerStatusForMode } from "@/lib/llm/llmProvider";

export const LLM_LOCAL_COMMAND_ENV_VAR = "GOTRADER_LLM_AGENT_COMMAND";

const runtimeEnv = () =>
  (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;

export function getLocalCommandLLMCommand() {
  return runtimeEnv()?.[LLM_LOCAL_COMMAND_ENV_VAR];
}

export function buildLocalCommandPayload(context: LLMResearchContextPacket) {
  return JSON.stringify(context, null, 2);
}

export const localCommandLLMProvider: LLMProvider = {
  mode: "local_command",
  label: "Local command provider",
  status: () => ({
    ...providerStatusForMode("local_command"),
    configured: Boolean(getLocalCommandLLMCommand()),
    command: getLocalCommandLLMCommand()
  }),
  async runAgents(context) {
    const command = getLocalCommandLLMCommand();
    if (!command) {
      throw new Error(`${LLM_LOCAL_COMMAND_ENV_VAR} is not configured. LLM advisory cannot be marked complete.`);
    }

    const _stdinPayload = buildLocalCommandPayload(context);
    throw new Error(
      "Browser frontend cannot spawn local commands. Use a secure local bridge or backend endpoint to pass JSON on stdin and read JSON on stdout."
    );
  }
};
