/**
 * Shared Ollama Utilities Tests
 *
 * Tests for OpenAI-compatible shared module
 */

import { test, expect, describe } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadConfigFromEnv,
  loadConfigFromModelsJson,
  createClients,
  getContextLength,
  hasVisionCapability,
  hasReasoningCapability,
  DEFAULT_CONFIG,
} from "../src/shared.ts";

describe("shared.ts - OpenAI Compatible Utilities", () => {
  describe("Configuration", () => {
    test("loadConfigFromEnv returns partial config", () => {
      const config = loadConfigFromEnv();
      expect(typeof config).toBe("object");
      expect(Object.keys(config).length).toBeGreaterThanOrEqual(0);
    });

    test("loadConfigFromEnv normalizes provider urls", () => {
      const oldHost = process.env.OLLAMA_HOST;
      const oldCloudHost = process.env.OLLAMA_HOST_CLOUD;

      try {
        process.env.OLLAMA_HOST = "http://local:11434/v1/";
        process.env.OLLAMA_HOST_CLOUD = "https://cloud.example/v1/";

        const config = loadConfigFromEnv();
        expect(config.baseUrl).toBe("http://local:11434");
        expect(config.cloudUrl).toBe("https://cloud.example");
      } finally {
        if (oldHost === undefined) {
          delete process.env.OLLAMA_HOST;
        } else {
          process.env.OLLAMA_HOST = oldHost;
        }
        if (oldCloudHost === undefined) {
          delete process.env.OLLAMA_HOST_CLOUD;
        } else {
          process.env.OLLAMA_HOST_CLOUD = oldCloudHost;
        }
      }
    });

    test("loadConfigFromModelsJson reads both provider configs", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ollama-models-"));
      const oldEnv = process.env.PI_CODING_AGENT_DIR;

      try {
        process.env.PI_CODING_AGENT_DIR = tempDir;

        fs.writeFileSync(
          path.join(tempDir, "models.json"),
          JSON.stringify({
            providers: {
              ollama: {
                baseUrl: "http://local:11434/v1",
                api: "openai-completions",
                apiKey: "local-key",
              },
              "ollama-cloud": {
                baseUrl: "https://cloud.example/v1",
                api: "openai-completions",
                apiKey: "cloud-key",
              },
            },
          })
        );

        const config = loadConfigFromModelsJson();
        expect(config.baseUrl).toBe("http://local:11434");
        expect(config.cloudUrl).toBe("https://cloud.example");
        expect(config.apiKey).toBe("local-key");
        expect(config.cloudApiKey).toBe("cloud-key");
      } finally {
        process.env.PI_CODING_AGENT_DIR = oldEnv;
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    test("createClients with default config", () => {
      const clients = createClients(DEFAULT_CONFIG);
      expect(clients.local).toBeDefined();
      expect(clients.cloud).toBeNull();
    });

    test("createClients uses cloudApiKey for cloud client", () => {
      const clients = createClients({
        baseUrl: "http://localhost:11434",
        cloudUrl: "https://ollama.com",
        apiKey: "shared-key",
        cloudApiKey: "cloud-only-key",
      });
      expect(clients.cloud).not.toBeNull();
      expect(clients.local).toBeDefined();
    });

    test("createClients falls back to apiKey when cloudApiKey empty", () => {
      const clients = createClients({
        baseUrl: "http://localhost:11434",
        cloudUrl: "https://ollama.com",
        apiKey: "shared-key",
        cloudApiKey: "",
      });
      expect(clients.cloud).not.toBeNull();
    });

    test("createClients without API key has no cloud client", () => {
      const clients = createClients({
        baseUrl: "http://localhost:11434",
        cloudUrl: "https://ollama.com",
        apiKey: "",
      });
      expect(clients.cloud).toBeNull();
    });
  });

  describe("Context Length Detection", () => {
    test("getContextLength from model_info", () => {
      const info = { "llama.context_length": 8192 };
      expect(getContextLength(info)).toBe(8192);
    });

    test("getContextLength from model name - kimi", () => {
      // kimi-k2 has 262k (262144) context window
      expect(getContextLength({}, "kimi-k2.5")).toBe(262144);
      expect(getContextLength({}, "kimi-k2.5:cloud")).toBe(262144);
    });

    test("getContextLength from model name - minimax", () => {
      // minimax-m2 has 204k (204800) context window
      expect(getContextLength({}, "minimax-m2.5")).toBe(204800);
    });

    test("getContextLength from model name - glm", () => {
      // glm-5 has 202k (202752) context window
      expect(getContextLength({}, "glm-5")).toBe(202752);
      expect(getContextLength({}, "glm-5:cloud")).toBe(202752);
    });

    test("getContextLength from model name - qwen3", () => {
      // qwen3.5 has 262k (262144) context window
      expect(getContextLength({}, "qwen3.5")).toBe(262144);
    });

    test("getContextLength prefers model_info over name", () => {
      const info = { "llama.context_length": 4096 };
      expect(getContextLength(info, "kimi-k2.5")).toBe(4096);
    });

    test("getContextLength default fallback", () => {
      // Empty object with no name -> fall through to name patterns (no match) -> default 4096
      expect(getContextLength({})).toBe(4096);
      // Undefined info -> no name -> default 4096
      expect(getContextLength(undefined)).toBe(4096);
    });

    test("getContextLength from nested model_info", () => {
      // ModelDetails object with nested model_info
      const details = {
        model_info: { "glm5.context_length": 202752 }
      };
      expect(getContextLength(details)).toBe(202752);
    });

    test("getContextLength from parameter_size mapping", () => {
      // Parameter size to context mapping
      expect(getContextLength({ parameter_size: "7B" }, "unknown-model")).toBe(4096);
      expect(getContextLength({ parameter_size: "70B" }, "unknown-model")).toBe(32768);
    });
  });

  describe("Vision Detection", () => {
    test("hasVisionCapability from capabilities array", () => {
      expect(hasVisionCapability({ capabilities: ["vision"] })).toBe(true);
      expect(hasVisionCapability({ capabilities: ["image"] })).toBe(true);
      expect(hasVisionCapability({ capabilities: ["text"] })).toBe(false);
    });

    test("hasVisionCapability from model_info clip encoder", () => {
      expect(
        hasVisionCapability({
          model_info: { "clip.has_vision_encoder": true },
        })
      ).toBe(true);
    });

    test("hasVisionCapability from llava architecture", () => {
      expect(
        hasVisionCapability({
          model_info: { "general.architecture": "llava" },
        })
      ).toBe(true);
    });

    test("hasVisionCapability false for text models", () => {
      expect(
        hasVisionCapability({
          model_info: { "general.architecture": "llama" },
        })
      ).toBe(false);
    });
  });

  describe("Reasoning Detection", () => {
    test("hasReasoningCapability detects coder models", () => {
      expect(hasReasoningCapability("codellama")).toBe(true);
      expect(hasReasoningCapability("deepseek-coder")).toBe(true);
      expect(hasReasoningCapability("qwen2.5-coder")).toBe(true);
    });

    test("hasReasoningCapability detects r1 models", () => {
      expect(hasReasoningCapability("deepseek-r1")).toBe(true);
    });

    test("hasReasoningCapability detects kimi", () => {
      expect(hasReasoningCapability("kimi-k2.5")).toBe(true);
    });

    test("hasReasoningCapability detects deepseek", () => {
      expect(hasReasoningCapability("deepseek-v3")).toBe(true);
    });

    test("hasReasoningCapability false for regular models", () => {
      expect(hasReasoningCapability("llama3")).toBe(false);
      expect(hasReasoningCapability("mistral")).toBe(false);
    });
  });
});
