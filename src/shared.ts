/**
 * Shared Ollama Utilities - Official Ollama Client Approach
 *
 * Uses the official Ollama JavaScript client for proper cloud/local API handling
 * https://github.com/ollama/ollama-js
 */

import { Ollama } from 'ollama';
import { getAgentDir, ProviderModelConfig } from '@mariozechner/pi-coding-agent';
import fs from 'node:fs';
import path from 'node:path';

export interface OllamaConfig {
  baseUrl: string;
  cloudUrl: string;
  apiKey: string;
  cloudApiKey: string;
}

export interface OllamaClients {
  local: Ollama;
  cloud: Ollama | null;
}

export interface OllamaExtensionState {
  config: OllamaConfig;
  clients: OllamaClients;
}

export interface ModelDetails {
  model_info?: {
    parameter_size?: string;
    quantization_level?: string;
    [key: string]: any;
  };
  details?: {
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
    [key: string]: any;
  };
  capabilities?: string[];
  parameter_size?: string;
  quantization_level?: string;
  families?: string[];
}

// Default configuration values
export const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: "http://localhost:11434",
  cloudUrl: "https://ollama.com",
  apiKey: "",
  cloudApiKey: "",
};

/**
 * Create Ollama clients from config.
 */
export function createClients(config: OllamaConfig): OllamaClients {
  const localClient = new Ollama({ host: config.baseUrl });
  const cloudKey = config.cloudApiKey || config.apiKey;
  const cloudClient = cloudKey
    ? new Ollama({ host: config.cloudUrl, headers: { Authorization: `Bearer ${cloudKey}` } })
    : null;
  
  return { local: localClient, cloud: cloudClient };
}

// ============================================================================
// FETCH MODELS
// ============================================================================

export async function fetchLocalModels(state: OllamaExtensionState): Promise<ProviderModelConfig[]> {
  const { clients } = state;
  const response = await clients.local.list();
  const models = response.models || [];

  const result: ProviderModelConfig[] = [];
  for (const m of models) {
    const details = await fetchModelDetails(clients.local, m.name);
    result.push(createModelConfig(m.name, false, details || undefined));
  }
  return result;
}

export async function fetchCloudModels(state: OllamaExtensionState): Promise<ProviderModelConfig[]> {
  const { clients } = state;
  if (clients.cloud) {
    const response = await clients.cloud.list();
    const models = response.models || [];

    const result: ProviderModelConfig[] = [];
    for (const m of models) {
      const details = await fetchModelDetails(clients.cloud, m.name);
      result.push(createModelConfig(m.name, true, details || undefined));
    }
    return result;
  }
  return [];
}

// ============================================================================
// MODEL CREATION
// ============================================================================

function createModelConfig(name: string, isCloud: boolean, details?: ModelDetails): ProviderModelConfig {
  const contextWindow = getContextLength(details || null, name);
  const isVision = details ? hasVisionCapability(details) : false;
  const isReasoning = hasReasoningCapability(name);

  const cloudEmoji = isCloud ? '☁️ ' : '';
  const visionEmoji = isVision ? '👁️ ' : '';

  return {
    id: name,
    name: `${cloudEmoji}${visionEmoji}${name}`,
    api: 'openai-completions',
    reasoning: isReasoning,
    input: isVision ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens: 8192,
  };
}

// ============================================================================
// CONFIGURATION HELPERS
// ============================================================================

/**
 * Load configuration from environment variables.
 */
export function loadConfigFromEnv(): Partial<OllamaConfig> {
  const config: Partial<OllamaConfig> = {};

  if (process.env.OLLAMA_HOST) {
    config.baseUrl = formatBaseUrl(process.env.OLLAMA_HOST);
  }
  if (process.env.OLLAMA_HOST_CLOUD) {
    config.cloudUrl = formatBaseUrl(process.env.OLLAMA_HOST_CLOUD);
  }
  if (process.env.OLLAMA_API_KEY) {
    config.apiKey = process.env.OLLAMA_API_KEY;
  }
  if (process.env.OLLAMA_API_KEY_CLOUD) {
    config.cloudApiKey = process.env.OLLAMA_API_KEY_CLOUD;
  }

  return config;
}

/**
 * Load config from pi's models.json.
 * Reads provider entries under `providers.ollama` and `providers.ollama-cloud`.
 */
export function loadConfigFromModelsJson(): Partial<OllamaConfig> {
  const config: Partial<OllamaConfig> = {};

  try {
    const agentDir = process.env.PI_CODING_AGENT_DIR
      ? path.resolve(process.env.PI_CODING_AGENT_DIR)
      : getAgentDir();
    const modelsPath = path.join(agentDir, 'models.json');

    if (!fs.existsSync(modelsPath)) return config;
    const raw = fs.readFileSync(modelsPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.providers) return config;

    const localProvider = parsed.providers.ollama;
    const cloudProvider = parsed.providers['ollama-cloud'];

    if (localProvider && typeof localProvider === 'object') {
      if (typeof localProvider.baseUrl === 'string') config.baseUrl = formatBaseUrl(localProvider.baseUrl);
      if (typeof localProvider.apiKey === 'string') config.apiKey = localProvider.apiKey;
    }

    if (cloudProvider && typeof cloudProvider === 'object') {
      if (typeof cloudProvider.baseUrl === 'string') config.cloudUrl = formatBaseUrl(cloudProvider.baseUrl);
      if (typeof cloudProvider.apiKey === 'string') config.cloudApiKey = cloudProvider.apiKey;
    }
  } catch {
    // ignore read/parse errors
  }

  return config;
}

export function loadConfig(): OllamaConfig {
  let config = { ...DEFAULT_CONFIG };

  const fileConfig = loadConfigFromModelsJson();
  if (fileConfig.baseUrl) config.baseUrl = fileConfig.baseUrl;
  if (fileConfig.cloudUrl) config.cloudUrl = fileConfig.cloudUrl;
  if (fileConfig.apiKey) config.apiKey = fileConfig.apiKey;

  // Environment override (highest priority)
  const envConfig = loadConfigFromEnv();
  config = { ...config, ...envConfig };
  return config;
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Formats a base URL by removing trailing slashes and v1 suffix.
 * @param url 
 * @returns Formatted URL
 */
function formatBaseUrl(url: string): string {
  url = url.replace(/\/+$/, '');
  if (url.endsWith('/v1')) {
    url = url.slice(0, -3);
  }
  return url;
}

/**
 * Check if local Ollama is running by attempting to list models.
 */
export async function isLocalRunning(client: Ollama): Promise<boolean> {
  try {
    await client.list();
    return true;
  } catch (err) {
    console.debug(`[pi-ollama] Local Ollama is not reachable: ${err}`);
    return false;
  }
}

/**
 * Fetch model details from Ollama client.
 */
export async function fetchModelDetails(client: Ollama, modelName: string): Promise<ModelDetails | null> {
  try {
    const info = await client.show({ model: modelName });
    return info as ModelDetails;
  } catch (err) {
    console.debug(`[pi-ollama] Could not fetch details for ${modelName}: ${err}`);
    return null;
  }
}

/**
 * Get context length from model details.
 */
export function getContextLength(modelInfo: ModelDetails | Record<string, unknown> | null, modelName?: string): number {
  if (!modelInfo) {
    if (modelName) return getContextLengthFromName(modelName);
    return 4096;
  }
  
  let info: Record<string, unknown>;
  if ('model_info' in modelInfo && modelInfo.model_info) {
    info = modelInfo.model_info as Record<string, unknown>;
  } else {
    info = modelInfo as Record<string, unknown>;
  }
  
  for (const key of Object.keys(info)) {
    if (key.endsWith('.context_length') && typeof info[key] === 'number') {
      return info[key] as number;
    }
  }
  
  const contextKeys = ['context_length', 'max_position_embeddings', 'max_sequence_length', 'n_ctx'];
  for (const key of contextKeys) {
    if (info[key] && typeof info[key] === 'number') {
      return info[key] as number;
    }
  }
  
  const size = (info['parameter_size'] as string) || '';
  if (size.includes('1B')) return 2048;
  if (size.includes('3B') || size.includes('7B')) return 4096;
  if (size.includes('13B') || size.includes('14B')) return 8192;
  if (size.includes('30B') || size.includes('34B')) return 16384;
  if (size.includes('70B')) return 32768;
  
  if (modelName) return getContextLengthFromName(modelName);
  return 4096;
}

function getContextLengthFromName(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes('llama3.2') || lower.includes('llama3.3') || lower.includes('llama3.1')) return 128000;
  if (lower.includes('llama3')) return 8192;
  if (lower.includes('mistral') || lower.includes('mixtral')) return 32768;
  if (lower.includes('qwen3')) return 262144;
  if (lower.includes('qwen2.5') || lower.includes('qwen')) return 32768;
  if (lower.includes('kimi')) return 262144;
  if (lower.includes('minimax')) return 204800;
  if (lower.includes('glm')) return 202752;
  if (lower.includes('gpt-oss')) return 128000;
  return 4096;
}

export function hasVisionCapability(modelInfo: ModelDetails | null): boolean {
  if (!modelInfo) return false;
  const caps = modelInfo.capabilities || [];
  if (caps.some(cap => cap.toLowerCase().includes('vision') || cap.toLowerCase().includes('image'))) {
    return true;
  }
  if (modelInfo.model_info) {
    const info = modelInfo.model_info as Record<string, unknown>;
    if (info['clip.has_vision_encoder'] === true) return true;
    const arch = info['general.architecture'] as string;
    if (arch) {
      const visionArchs = ['llava', 'bakllava', 'moondream', 'llava-next'];
      if (visionArchs.some(va => arch.toLowerCase().includes(va))) return true;
    }
  }
  return false;
}

export function hasReasoningCapability(modelName: string): boolean {
  const lowerName = modelName.toLowerCase();
  return lowerName.includes('reason') || lowerName.includes('r1') || lowerName.includes('instruct') || 
         lowerName.includes('chat') || lowerName.includes('coder') || lowerName.includes('code') || 
         lowerName.includes('deepseek') || lowerName.includes('kimi') || lowerName.includes('phi') || 
         lowerName.includes('qwq');
}
