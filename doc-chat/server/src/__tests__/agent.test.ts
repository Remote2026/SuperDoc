import { describe, expect, it } from "vitest";
import { buildDocAgent } from "../mastra.js";

describe("buildDocAgent", () => {
  it("creates a Mastra agent wired with the extract tool", () => {
    const { agent, agentId } = buildDocAgent({
      apiKey: "sk-test-placeholder",
    });

    expect(agentId).toBe("doc_analyzer");
    expect(agent).toBeTruthy();
    expect(typeof agent.getDescription).toBe("function");
    expect(agent.getDescription()).toMatch(/章节|structure|docx/i);
  });
});
