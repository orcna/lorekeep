# LoreKeep with Ollama (Local AI)

This guide explains how to set up and run LoreKeep with **Ollama**, a local AI server that runs on your machine.

## Prerequisites

- **Node.js** 16+ (already installed)
- **Ollama** (free, open-source)

## Step 1: Install Ollama

1. Download Ollama from: https://ollama.ai
2. Run the installer for your OS (Windows/Mac/Linux)
3. Follow the installation prompts

## Step 2: Start Ollama Server

**Windows/Mac/Linux:**
```bash
ollama serve
```

This starts the Ollama API server on `http://localhost:11434` (default port).
Keep this terminal open while using LoreKeep.

## Step 3: Pull a Model

In a **new terminal**, download an AI model:

```bash
# Mistral (recommended, ~4GB, good balance of speed/quality)
ollama pull mistral

# Or try these alternatives:
ollama pull neural-chat        # Optimized for chat
ollama pull llama2             # Meta's LLaMA 2 (~7GB)
ollama pull dolphin-mixtral    # High quality but slower
```

You only need to pull a model once - it's cached locally.

## Step 4: Run LoreKeep

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## Available Models

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| **mistral** | 4GB | Fast | Good | Default choice |
| neural-chat | 4GB | Fast | Good | Conversations |
| llama2 | 7GB | Medium | Better | General use |
| dolphin-mixtral | 26GB | Slower | Excellent | Complex tasks |

## Switching Models

Edit `.env.local`:
```env
VITE_OLLAMA_MODEL="mistral"  # Change to another model name
```

Then restart `npm run dev`.

## Troubleshooting

### "Cannot connect to Ollama"
- ✅ Is `ollama serve` running in another terminal?
- ✅ Check `.env.local` has `VITE_OLLAMA_URL="http://localhost:11434"`
- ✅ Restart `npm run dev` after starting Ollama

### Responses are slow
- Use a smaller model (mistral, neural-chat)
- Or wait for first response (models warm up)
- Check your CPU/RAM usage

### "Model not found"
- Run: `ollama pull mistral` (or your chosen model)
- List available models: `ollama list`

## Performance Tips

1. **First request is slow** - Model loads into memory, then gets faster
2. **Keep Ollama running** - Don't close the `ollama serve` terminal
3. **Check system resources** - Needs 4-8GB RAM available
4. **GPU acceleration** - Ollama uses GPU if available (NVIDIA, Apple Silicon)

## API Reference

The app uses Ollama's `/api/generate` endpoint. See: https://github.com/ollama/ollama/blob/main/docs/api.md

For custom settings, edit `src/lib/aiProvider.ts` and adjust:
- `temperature` (0-1, higher = more creative)
- `top_p` (0-1, diversity of responses)
- `num_ctx` (context window size)
