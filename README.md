# Pi Ollama Extension

Ollama integration for [pi-coding-agent](https://github.com/badlogic/pi-mono) with accurate model details from `/api/show`.

Fork of https://github.com/0xKobold/pi-ollama

## Installation

```bash
# Via pi CLI
pi install git:github.com/danmactough/pi-ollama

# Or in pi-config.ts
{
  extensions: [
    'git:github.com/danmactough/pi-ollama'
  ]
}

# Or temporary (testing)
pi -e git:github.com/danmactough/pi-ollama
```

## Features

- 🦙 **Local Ollama** - Connect to `localhost:11434` (or custom endpoint)
- ☁️ **Ollama Cloud** - Separate `ollama-cloud` provider
- 📊 **Accurate Model Details** - Uses `/api/show` for real context length
- 👁️ **Vision Detection** - Detects vision from capabilities array
- 🧠 **Reasoning Models** - Auto-detects thought-capable models
- 🔍 **Model Info** - Query specific model parameters
- 🔧 **Standard Config** - Uses pi's native `auth.json` and `models.json` plus env var overrides

## Quick Start

```bash
# Check connection
/ollama-status

# List all models
/ollama-models

# Get detailed info for specific model
/ollama-info gemma3:27b
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
curl http://localhost:11434/api/show -d '{"model": "llama3.1:70b", "verbose": true}'
```

Response includes:
- `model_info.context_length` — accurate context window
- `capabilities` — `["completion", "vision"]`
- `details.parameter_size` — `"4.3B"`, `"70B"`, etc.
- `details.family` — `"gemma3"`, `"llama"`, etc.

## Model Display

Models are displayed with accurate metadata:

```
 🦙 Available Models

 📍 Local:
   nomic-embed-text:latest (2,048 ctx)
   llama3.1:8b (131,072 ctx)

 ☁️ Cloud:
   ☁️ 👁️ kimi-k2.6 (262,144 ctx)
   ☁️ qwen3-coder:480b (262,144 ctx)
   ☁️ qwen3-next:80b (262,144 ctx)
   ☁️ qwen3-coder-next (262,144 ctx)
   ☁️ gpt-oss:20b (131,072 ctx)
   ☁️ 👁️ qwen3-vl:235b-instruct (262,144 ctx)
   etc...
```

**Badges:**
- 📍 Local model
- ☁️ Cloud model
- 👁️ Vision-capable
- 🧠 Reasoning-capable

## Configuration (optional)

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
      // API key may be set via env or models.json but the preferred method is
      // to securely store the api key in auth.json using /login
      "apiKey": "sk-..."
    }
  }
}
```

The extension will:
1. Read `providers.ollama.baseUrl` as the local endpoint.
2. Read `providers.ollama.apiKey` as the local API key.
3. Read `providers.ollama-cloud.baseUrl` as the cloud endpoint.
4. Read `auth.json[ollama-cloud]` as the cloud API key. If omitted, falls back to `providers.ollama-cloud.apiKey`.
5. Query **both** endpoints dynamically for available models via `/api/tags`.
6. Register `ollama` and `ollama-cloud` providers independently.

**Note:** Any `models` array you define under these providers in `models.json` is ignored — this extension always discovers models dynamically from the Ollama API.

### Environment Variables

```bash
export OLLAMA_HOST="http://localhost:11434"      # overrides baseUrl
export OLLAMA_HOST_CLOUD="https://ollama.com"    # overrides cloudUrl
export OLLAMA_API_KEY="sk-..."                   # overrides apiKey for ollama-cloud
```

## Local Development

```bash
git clone https://github.com/danmactough/pi-ollama
cd pi-ollama
npm install
npm run build
pi install ./
```

## API Functions

```typescript
import { fetchModelDetails, getContextLength, hasVisionCapability } from '@danmactough/pi-ollama';

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

MIT © 0xKobold, Dan MacTough
