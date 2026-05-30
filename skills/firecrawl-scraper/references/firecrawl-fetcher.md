---
name: firecrawl-fetcher
version: 1.0.1
author: BenedictKing
description: Independent subtask for executing Firecrawl API calls (internal use)
allowed-tools:
  - Bash
context: fork
---

# Firecrawl Fetcher Sub-skill

> Note: This is an internal sub-skill, invoked by the `firecrawl-scraper` main skill through the Task tool.

## Purpose

Execute Firecrawl API calls in an independent context with `context: fork`, avoiding carrying main conversation context, reducing token consumption.

## Received Parameters

Receives complete command through Task's `prompt`, using stdin for JSON:

```bash
cat <<'JSON' | node .claude/skills/firecrawl-scraper/firecrawl-api.cjs <scrape|crawl|map|batch-scrape|crawl-status|batch-status|batch-errors> [--wait]
{ ...payload... }
JSON
```

**Batch scrape workflow:**
- `batch-scrape` submits a batch job and returns `{ success, id, url }`.
- `batch-scrape --wait` submits and polls until the batch completes.
- `batch-status <id> [--wait]` checks batch progress; with `--wait` polls to terminal status.
- `batch-errors <id>` retrieves batch scrape errors.
- Batch status response includes `status`, `total`, `completed`, `data[]`, and optionally `next` for pagination.

## Output

Returns Firecrawl API's JSON response as-is (pretty printed).
