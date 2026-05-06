/**
 * Pi Ollama Extension Tests
 */

import { test, expect, describe } from "bun:test";
import {
  fetchModelDetails,
  getContextLength,
  hasVisionCapability,
} from "../src/shared.ts";

describe("pi-ollama", () => {
  describe("Model Info Extraction", () => {
    test("extracts context length from architecture-specific keys", () => {
      expect(getContextLength({ "gemma3.context_length": 131072 })).toBe(131072);
      expect(getContextLength({ "llama.context_length": 8192 })).toBe(8192);
    });

    test("falls back to general context_length", () => {
      expect(getContextLength({ context_length: 4096 })).toBe(4096);
    });

    test("falls back to 4096 for unknown models", () => {
      expect(getContextLength({})).toBe(4096);
    });

    test("detects vision capability", () => {
      expect(
        hasVisionCapability({
          model_info: {
            "general.architecture": "llava",
            "clip.has_vision_encoder": true,
          },
        } as any)
      ).toBe(true);
    });

    test("detects no vision for text-only models", () => {
      expect(
        hasVisionCapability({
          model_info: {
            "general.architecture": "llama",
          },
        } as any)
      ).toBe(false);
    });
  });

  describe("Extension Registration", () => {
    test("loads without errors", async () => {
      const { default: ollamaExt } = await import("../src/index.ts");
      const mockPi = {
        registerCommand: () => {},
        registerTool: () => {},
        registerProvider: () => {},
        on: () => {},
      };

      ollamaExt(mockPi as any);
      expect(true).toBe(true);
    });

    test("registers commands", async () => {
      const commands: string[] = [];
      const mockPi = {
        registerCommand: (name: string) => commands.push(name),
        registerTool: () => {},
        registerProvider: () => {},
        on: () => {},
      };

      const { default: ollamaExt } = await import("../src/index.ts");
      ollamaExt(mockPi as any);

      expect(commands).toEqual(["ollama-status", "ollama-info", "ollama-models", "ollama"]);
    });
  });

  describe("Configuration", () => {
    test("handles missing config gracefully", async () => {
      const { default: ollamaExt } = await import("../src/index.ts");
      const mockPi = {
        registerCommand: () => {},
        registerTool: () => {},
        registerProvider: () => {},
        on: () => {},
      };

      ollamaExt(mockPi as any);
      expect(true).toBe(true);
    });
  });

  describe("Model Parsing", () => {
    test("handles various model architectures", () => {
      const testCases = [
        { info: { "gemma3.context_length": 32000 }, expected: 32000 },
        { info: { "llama.context_length": 128000 }, expected: 128000 },
        { info: { "mistral.context_length": 32768 }, expected: 32768 },
        { info: { "qwen2.context_length": 16384 }, expected: 16384 },
        { info: { "phi3.context_length": 12000 }, expected: 12000 },
        { info: { "kimi.context_length": 262144 }, expected: 262144 },
        { info: { "kimi2_5.context_length": 262144 }, expected: 262144 },
        { info: { "deepseek.context_length": 128000 }, expected: 128000 },
        { info: { "claude.context_length": 200000 }, expected: 200000 },
        { info: { "mixtral.context_length": 32768 }, expected: 32768 },
        { info: {}, name: "kimi-k2.5", expected: 262144 },
        { info: {}, name: "unknown-model", expected: 4096 },
      ];

      for (const tc of testCases) {
        expect(getContextLength(tc.info as any, tc.name)).toBe(tc.expected);
      }
    });

    test("falls back to name detection for kimi models", () => {
      expect(getContextLength({}, "kimi-k2.5:cloud")).toBe(262144);
    });

    test("detects context_length in unknown keys", () => {
      expect(getContextLength({ "custom_model.context_length": 64000 } as any)).toBe(64000);
    });

    test("prefers specific over generic", () => {
      const model: any = {
        context_length: 4096,
        "llama.context_length": 8192,
      };

      expect(getContextLength(model)).toBe(8192);
    });
  });

  describe("Shared Exports", () => {
    test("exports fetchModelDetails", () => {
      expect(typeof fetchModelDetails).toBe("function");
    });

    test("exports getContextLength", () => {
      expect(typeof getContextLength).toBe("function");
    });

    test("exports hasVisionCapability", () => {
      expect(typeof hasVisionCapability).toBe("function");
    });
  });

  describe("Error Handling", () => {
    test("handles null model info with name fallback", () => {
      expect(getContextLength(null, "kimi-k2.5:cloud")).toBe(262144);
    });

    test("detects kimi from name when model_info empty", () => {
      expect(getContextLength({}, "kimi-k2.5:cloud")).toBe(262144);
    });

    test("detects minimax from name", () => {
      expect(getContextLength({}, "minimax-m2.5:cloud")).toBe(204800);
    });

    test("handles undefined model info", () => {
      expect(getContextLength(undefined)).toBe(4096);
    });

    test("handles malformed model info", () => {
      const malformed: any = {
        "gemma3.context_length": "not-a-number",
        "general.architecture": 12345,
      };

      expect(typeof getContextLength(malformed)).toBe("number");
      expect(typeof hasVisionCapability(malformed)).toBe("boolean");
    });
  });
});
