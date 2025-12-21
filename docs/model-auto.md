# Auto model selection (`--model auto`)

`--model auto` picks a model based on input kind + token size, and retries with fallbacks when something fails.

## What it does

- Builds a ranked list of model “attempts” (native first, optional OpenRouter fallback).
- Skips attempts that don’t have the required API key configured.
- On any request error, tries the next attempt.
- If no model is usable, prints the extracted text (no LLM summary).

## “No model needed” shortcut

If the extracted text is already shorter than (or roughly equal to) the requested output size, `--model auto` prints the extracted text directly.

You’ll still see a `via …` footer when non-trivial extraction happened (Firecrawl, markitdown, YouTube transcript, Whisper, etc.).

## OpenRouter vs native

Model ids:

- Native: `<provider>/<model>` (e.g. `openai/gpt-5-nano`, `google/gemini-3-flash-preview`)
- Forced OpenRouter: `openrouter/<openrouter-model-id>` (e.g. `openrouter/openai/gpt-5-nano`)

Behavior:

- If you pass an `openrouter/...` model id, the request uses OpenRouter (and requires `OPENROUTER_API_KEY`).
- If you pass a native model id, the CLI prefers the native provider SDK when its key is available, and can fall back to OpenRouter when no native key exists (and `OPENROUTER_API_KEY` is set).

OpenRouter provider ordering:

- Global default: `OPENROUTER_PROVIDERS="groq,google-vertex,..."` (optional)
- Per-candidate: `openrouterProviders` in config (optional)

## How selection is ranked

Signals:

- `kind`: `text|website|youtube|file|image|video`
- `promptTokens`: estimated from the extracted text
- `desiredOutputTokens`: from `--max-output-tokens` (or inferred from `--length`)
- LiteLLM catalog (via `tokentally`): max input tokens + pricing (cache: `~/.summarize/cache/`)
- Candidate weights: `score.quality|speed|cost` (config)

Notes:

- Auto mode is non-streaming (so a failed attempt won’t partially print output).
- Video understanding is only attempted when `--video-mode` is `auto` or `understand`, and a video-capable model is selected.

## Config

Default config file: `~/.summarize/config.json`

This file is parsed leniently (JSON5), but **comments are not allowed**.

Example:

```json
{
  "model": "auto",
  "media": { "videoMode": "auto" },
  "auto": {
    "rules": [
      {
        "when": { "kind": "video" },
        "candidates": [
          { "model": "google/gemini-3-flash-preview", "score": { "quality": 8, "speed": 8, "cost": 8 } }
        ]
      },
      {
        "when": { "kind": "website" },
        "candidates": [
          { "model": "openai/gpt-5-nano", "score": { "quality": 7, "speed": 9, "cost": 10 } },
          { "model": "xai/grok-4-fast-non-reasoning", "score": { "quality": 7, "speed": 8, "cost": 8 } }
        ]
      },
      {
        "candidates": [
          { "model": "openai/gpt-5-nano" },
          { "model": "openrouter/openai/gpt-5-nano" }
        ]
      }
    ]
  }
}
```

