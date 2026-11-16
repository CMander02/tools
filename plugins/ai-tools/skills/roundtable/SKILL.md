---
name: roundtable
description: Launch a multi-AI roundtable discussion between Claude, Codex, and Gemini. Use when the user wants multiple AI perspectives on a problem — bug analysis, code review, architecture decisions, or any task benefiting from collaborative AI discussion.
allowed-tools: Bash Read Write Grep Glob
---

# Roundtable Skill Guide

## Overview

This skill orchestrates a **roundtable discussion** between Claude Code, OpenAI Codex, and Google Gemini. The current Claude Code session acts as **moderator** — it does NOT participate in the discussion directly. Instead, it spawns separate AI processes, monitors for consensus, and presents the final results to the user.

## When to Use

- User asks for "multiple perspectives", "roundtable", "AI discussion", or "let them debate"
- Bug analysis where cross-validation from multiple models reduces blind spots
- Code review requiring diverse analysis approaches
- Architecture decisions with non-obvious trade-offs

## Running a Roundtable

### Step 1: Confirm the question

Ask the user what question or task to submit. If context files are needed (source code, logs, specs), confirm which files to include.

### Step 2: Run submit.py

```bash
python scripts/submit.py "<question>" --context <file1> <file2> --config roundtable.toml
```

For background execution (non-blocking):
```bash
python scripts/submit.py "<question>" --context <file1> --no-block
```

The script will:
1. **Round 1**: Run all participants in parallel (independent analysis)
2. **Round 2+**: Run serially (Claude → Codex → Gemini), each seeing prior responses
3. **Exit** when all participants emit `[<name>:CONSENSUS]` or `max_rounds` is reached
4. Print round summaries as they complete

### Step 3: Present results

After completion, read the session summary:

```bash
python scripts/query.py --last
```

Summarize for the user:
- What each AI concluded
- Where they agreed/disagreed
- How many rounds it took to reach consensus (or if forced exit)
- The final recommended approach

## Configuration

Edit `roundtable.toml` to control:
- `max_rounds` — maximum discussion rounds (default: 5)
- `consensus_marker` — the marker string (default: "CONSENSUS")
- `order` — serial discussion order for round 2+
- `participants.*` — enable/disable participants, customize commands

## Querying Past Sessions

```bash
# List all sessions
python scripts/query.py --list

# View most recent session
python scripts/query.py --last

# View specific session
python scripts/query.py --session <session-id>
```

## Key Principles

- **Moderator does NOT participate** — the current Claude Code process only orchestrates and summarizes
- **All AI processes are isolated** — separate subprocesses, no shared context with this conversation
- **Results are persistent** — stored in `.roundtable/<session-id>/` for later review
- **Consensus is explicit** — each AI must deliberately emit its consensus marker
