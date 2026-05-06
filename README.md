# Pi Ollama Extension

Ollama integration for [pi-coding-agent](https://github.com/badlogic/pi-mono) with accurate model details from `/api/show`.

## Changelog

### v0.5.0

- **Breaking**: Config now reads provider settings from pi's standard `models.json` and env vars instead of custom `settings.json` keys.
- Reads `providers.ollama.baseUrl` / `apiKey` for the local endpoint, and `providers.ollama-cloud.baseUrl` / `apiKey` for the cloud endpoint.
- `ollama-cloud` gets its own `apiKey`; if omitted it falls back to the `ollama` provider's key or `OLLAMA_API_KEY`.
- Static `models` arrays in `models.json` are ignored — models are always discovered dynamically via `/api/tags`.
- Provider base URLs are normalized before registration, so trailing `/` and `/v1` don’t double up.

### v0.4.1

- **Fix**: Cloud models now correctly use `/v1` endpoint. Previously, `ollama-cloud` was registered with `baseUrl: "https://ollama.com"`, causing pi to hit `https://ollama.com/chat/completions` (HTML homepage) instead of `https://ollama.com/v1/chat/completions`. This was already fixed for the local provider but was missed when the cloud provider was introduced.
- **Fix**: Trailing slashes in `cloudUrl` config are now properly stripped before appending `/v1`.

## Installation

```bash
# Via pi CLI
pi install npm:@0xkobold/pi-ollama

# Or in pi-config.ts
{
  extensions: [
    'npm:@0xkobold/pi-ollama'
  ]
}

# Or temporary (testing)
pi -e npm:@0xkobold/pi-ollama
```

## Features

- 🦙 **Local Ollama** - Connect to `localhost:11434` (or custom endpoint)
- ☁️ **Ollama Cloud** - Separate `ollama-cloud` provider via `models.json`
- 📊 **Accurate Details** - Uses `/api/show` for real context length
- 👁️ **Vision Detection** - Detects vision from capabilities array
- 🧠 **Reasoning Models** - Auto-detects thought-capable models
- 🔍 **Model Info** - Query specific model parameters
- 🔧 **Standard Config** - Uses pi's native `models.json` plus env var overrides

## Quick Start

```bash
# Check connection
/ollama-status

# List all models (with accurate context length)
/ollama-models

# Get detailed info for specific model
/ollama-info gemma3
/ollama-info llama3.1:70b
```

## Commands

| Command | Description |
|---------|-------------|
| `/ollama-status` | Check connection status |
| `/ollama-models` | List models with context length |
| `/ollama-info MODEL` | Show model details from `/api/show` |

## How It Works

The extension reads provider config from pi's standard **`models.json`**, queries Ollama's `/api/tags` for dynamically available models, and registers two separate providers:

- **`ollama`** — models from your local (or custom) endpoint
- **`ollama-cloud`** — models from the cloud endpoint

It also uses Ollama's `/api/show` endpoint to get accurate model information:

```bash
curl http://localhost:11434/api/show -d '{"model": "gemma3", "verbose": true}'
```

Response includes:
- `model_info.context_length` — accurate context window
- `capabilities` — `["completion", "vision"]`
- `details.parameter_size` — `"4.3B"`, `"70B"`, etc.
- `details.family` — `"gemma3"`, `"llama"`, etc.

## Model Display

Models are displayed with accurate metadata:

```
📍 Local:
  👁️ gemma3 (131,072 ctx)
  🧠 codellama:70b (16,384 ctx)
  llama3.1 (128,000 ctx)

☁️ Cloud:
  👁️ kimi-k2.5 (262,144 ctx)
  qwen3 (262,144 ctx)
```

**Badges:**
- 📍 Local model
- ☁️ Cloud model
- 👁️ Vision-capable
- 🧠 Reasoning-capable

## Configuration

Config is read from pi's standard **`models.json`** with environment-variable overrides.

### `models.json`

Add to `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama"
    },
    "ollama-cloud": {
      "baseUrl": "https://ollama.com/v1",
      "api": "openai-completions",
      "apiKey": "sk-..."
    }
  }
}
```

The extension will:
1. Read `providers.ollama.baseUrl` as the local endpoint.
2. Read `providers.ollama.apiKey` as the local API key.
3. Read `providers.ollama-cloud.baseUrl` as the cloud endpoint.
4. Read `providers.ollama-cloud.apiKey` as the cloud API key. If omitted, it falls back to `providers.ollama.apiKey` or `OLLAMA_API_KEY`.
5. Query **both** endpoints dynamically for available models via `/api/tags`.
6. Register `ollama` and `ollama-cloud` providers independently.

**Note:** Any `models` array you define under these providers in `models.json` is ignored — this extension always discovers models dynamically from the Ollama API.

### Environment Variables

```bash
export OLLAMA_HOST="http://localhost:11434"      # overrides baseUrl
export OLLAMA_HOST_CLOUD="https://ollama.com"    # overrides cloudUrl
export OLLAMA_API_KEY="sk-..."                   # overrides apiKey
export OLLAMA_API_KEY_CLOUD="sk-..."             # overrides cloudApiKey
```

## Local Development

```bash
git clone https://github.com/0xKobold/pi-ollama
cd pi-ollama
npm install
npm run build
pi install ./
```

## API Functions

```typescript
import { fetchModelDetails, getContextLength, hasVisionCapability } from '@0xkobold/pi-ollama';

// Get model details
const details = await fetchModelDetails('gemma3', 'http://localhost:11434');

// Extract context length
const ctx = getContextLength(details?.model_info); // 131072

// Check vision support
const hasVision = hasVisionCapability(details); // true
```

## Supported Capabilities

The extension detects:
- **Vision**: From `capabilities` array or `model_info` keys
- **Reasoning**: From model name (coder, r1, deepseek, think, reason)
- **Context Length**: From `model_info.*.context_length`

## License

MIT © 0xKobold
