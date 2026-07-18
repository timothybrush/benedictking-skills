---
name: codex-runner
version: 1.0.5
author: BenedictKing
description: Independent subtask for executing Lint and codex review with model selection based on task difficulty (internal use)
allowed-tools:
  - Bash
context: fork
---

# Codex Runner Sub-skill

> **Note**: This is an internal sub-skill, invoked by the `codex-review` main skill through the Task tool.

## Purpose

Independently execute Lint and `codex review` commands, using `context: fork` to avoid carrying main conversation context and reduce token consumption.

## Received Parameters

Receives complete command chain through Task tool's prompt parameter:

1. **Lint command**: Auto-selected based on project type (go fmt, npm run lint:fix, black, etc.)
2. **Review mode**: `--uncommitted` or `--commit HEAD` or `--base <branch>`
3. **Model config**: `--config model=gpt-5.6-terra|gpt-5.6-sol --config model_reasoning_effort=ultra`
4. **Timeout**: Controlled through Task tool's timeout parameter (typically 10 min normal, 15 min difficult, 40 min critical)

## Command Examples

```bash
# Build: <lint command> && codex review <mode> --config model=<model> --config model_reasoning_effort=ultra
#
# Lint command by project type:
#   Go:     go fmt ./... && go vet ./...
#   Node:   npm run lint:fix
#   Python: black . && ruff check --fix .
#
# Model by difficulty:
#   Normal              -> gpt-5.6-terra + ultra
#   Difficult / Critical -> gpt-5.6-sol + ultra

# Example: Go project, Normal task
go fmt ./... && go vet ./... && codex review --uncommitted --config model=gpt-5.6-terra --config model_reasoning_effort=ultra

# Review mode varies by working directory state. Use Terra for normal work and replace it with Sol for difficult or critical work:
codex review --uncommitted --config model=gpt-5.6-terra --config model_reasoning_effort=ultra   # normal uncommitted changes
codex review --commit HEAD --config model=gpt-5.6-terra --config model_reasoning_effort=ultra   # normal clean dir, last commit
codex review --base main   --config model=gpt-5.6-terra --config model_reasoning_effort=ultra   # normal branch review
```

## Execution Flow

1. **Lint First**: Execute static analysis tools to fix formatting issues first
2. **Codex Review**: Execute code review only after lint succeeds

## Output Format

Returns complete output directly, including:

- Lint tool fix results
- Code review summary
- List of issues found
- Improvement suggestions

## Important Notes

- Must be executed in git repository directory
- Ensure codex command is properly configured and logged in
- Timeout is controlled by the caller through the Task timeout parameter
- Commands are chained with `&&`, so lint failure will stop the subsequent codex review
