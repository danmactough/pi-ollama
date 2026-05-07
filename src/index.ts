/**
 * Pi Ollama Extension - Using Official ollama-js Client
 *
 * Uses the official Ollama JavaScript client for proper cloud/local API handling
 * https://github.com/ollama/ollama-js
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
  createClients,
  isLocalRunning,
  fetchLocalModels,
  fetchCloudModels,
  fetchModelDetails,
  getContextLength,
  hasVisionCapability,
  loadConfig,
  type OllamaExtensionState,
  type ModelDetails,
} from './shared.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Initializes the extension state from pi settings and environment variables.
 */
function initializeState(): OllamaExtensionState {
  const config = loadConfig();
  const clients = createClients(config);
  return { config, clients };
}

// ============================================================================
// COMMANDS
// ============================================================================

async function handleStatus(state: OllamaExtensionState, ctx: ExtensionCommandContext) {
  const { clients, config } = state;
  const hasLocal = await isLocalRunning(clients.local);
  const hasCloudKey = !!(config.cloudApiKey || ctx.modelRegistry.authStorage.getApiKey('ollama-cloud'));

  const lines = [
    '🦙 Ollama Status',
    '',
    `Local: ${hasLocal ? '✅ Connected' : '❌ Not running'}`,
    `Cloud: ${hasCloudKey ? '✅ API key set' : '❌ No API key'}`,
    '',
    `Base URL: ${config.baseUrl}`,
    `Cloud URL: ${config.cloudUrl}`,
  ];
  ctx.ui?.notify?.(lines.join('\n'), 'info');
}

async function handleModelInfo(state: OllamaExtensionState, args: string, ctx: ExtensionCommandContext) {
  const modelName = args.trim();
  if (!modelName) {
    ctx.ui?.notify?.('Usage: /ollama-info MODEL_NAME', 'error');
    return;
  }

  const { clients } = state;
  let details: ModelDetails | null = null;
  let isCloud = false;

  details = await fetchModelDetails(clients.local, modelName);
  if (!details && clients.cloud) {
    details = await fetchModelDetails(clients.cloud, modelName);
    isCloud = true;
  }

  if (!details) {
    ctx.ui?.notify?.(`Could not fetch details for ${modelName}`, 'error');
    return;
  }

  const contextLength = getContextLength(details);
  const isVision = hasVisionCapability(details);
  const paramSize = (details.details?.parameter_size ?? details?.parameter_size) || 'Unknown';
  const family = details.families?.find(f => f !== undefined) ?? 'Unknown';

  const lines = [
    `🦙 Model: ${modelName}${isCloud ? ' (cloud)' : ''}`,
    '',
    `Family: ${family}`,
    `Parameters: ${paramSize}`,
    `Context: ${contextLength.toLocaleString()} tokens`,
    `Vision: ${isVision ? '✅' : '❌'}`,
  ];

  if (details.capabilities?.length) {
    lines.push('', `Capabilities: ${details.capabilities.join(', ')}`);
  }

  ctx.ui?.notify?.(lines.join('\n'), 'info');
}

async function handleModels(pi: ExtensionAPI, state: OllamaExtensionState, ctx?: ExtensionCommandContext) {
  const [localModelsResult, cloudModelsResult] = await Promise.allSettled([fetchLocalModels(state), fetchCloudModels(state)]);

  const localModels = localModelsResult.status === 'fulfilled' ? localModelsResult.value : [];
  const cloudModels = cloudModelsResult.status === 'fulfilled' ? cloudModelsResult.value : [];
  if (localModelsResult.status === 'rejected') {
    ctx?.ui.notify(`Failed to fetch local models: ${localModelsResult.reason}`, 'error');
  }
  if (cloudModelsResult.status === 'rejected') {
    ctx?.ui.notify(`Failed to fetch cloud models: ${cloudModelsResult.reason}`, 'error');
  }
  // Remove local models that are actually cloud models
  const cloudModelIds = new Set(cloudModels.map(m => m.id));
  const uniqueLocalModels = localModels.filter(lm => {
    const modelId = lm.id.replace(/[^A-Za-z0-9.]cloud$/, '');
    return !cloudModelIds.has(modelId);
  }); 

  const lines = ['🦙 Available Models', ''];
  if (uniqueLocalModels.length > 0) {
    lines.push('📍 Local:');
    uniqueLocalModels.forEach(m => {
      lines.push(`  ${m.name} (${m.contextWindow.toLocaleString()} ctx)`);
    });
    lines.push('');
  }
  if (cloudModels.length > 0) {
    lines.push('☁️ Cloud:');
    cloudModels.forEach(m => {
      lines.push(`  ${m.name} (${m.contextWindow.toLocaleString()} ctx)`);
    });
  }
  if (uniqueLocalModels.length === 0 && cloudModels.length === 0) {
    lines.push('No models found. Ensure Ollama is running locally or set API key for cloud.');
  }
  ctx?.ui?.notify?.(lines.join('\n'), 'info');

  if (uniqueLocalModels.length > 0) {
    pi.registerProvider('ollama', {
      baseUrl: `${state.config.baseUrl}/v1`,
      apiKey: 'ollama',
      api: 'openai-completions',
      models: uniqueLocalModels,
    });
  }

  if (cloudModels.length > 0 && state.clients.cloud) {
    pi.registerProvider('ollama-cloud', {
      baseUrl: `${state.config.cloudUrl}/v1`,
      apiKey: state.config.cloudApiKey, // API key may be set via env or pi models.json or may use an arbitrary string to securely store the api key in auth.json using /login
      api: 'openai-completions',
      models: cloudModels,
    });
  }
}

// ============================================================================
// EXTENSION EXPORT
// ============================================================================

export default async function ollamaExtension(pi: ExtensionAPI) {
  const state = initializeState();

  pi.registerCommand('ollama-status', {
    description: 'Check Ollama connection status',
    handler: async (_args: string, ctx: ExtensionCommandContext) => handleStatus(state, ctx),
  });

  pi.registerCommand('ollama-info', {
    description: 'Show model details',
    handler: async (args: string, ctx: ExtensionCommandContext) => handleModelInfo(state, args, ctx),
  });

  pi.registerCommand('ollama-models', {
    description: 'List available models',
    handler: async (_args: string, ctx: ExtensionCommandContext) => handleModels(pi, state, ctx),
  });

  pi.registerCommand('ollama', {
    description: 'Ollama management',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const [sub] = args.trim().split(/\s+/);
      switch (sub) {
        case 'status': return handleStatus(state, ctx);
        case 'info': {
          const modelName = args.slice(4).trim();
          if (!modelName) {
            ctx.ui?.notify?.('Usage: /ollama info MODEL_NAME', 'error');
            return;
          }
          return handleModelInfo(state, modelName, ctx);
        }
        case 'models': return handleModels(pi, state, ctx);
        default:
          ctx.ui?.notify?.([
            '🦙 Ollama Commands',
            '',
            '/ollama status  - Check connection',
            '/ollama info MODEL  - Show model details',
            '/ollama models  - List models',
          ].join('\n'), 'info');
      }
    },
  });

  try {
    await handleModels(pi, state);
  } catch (err) {
    console.error(`[pi-ollama] Error during initial model fetch:`, err);
  }
}
