# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Army of Agents (AOA) is a TypeScript CLI tool that dispatches multiple Claude agents to work on tasks in parallel. The tool coordinates agents using Git worktrees to prevent concurrent workspace conflicts.

## Core Architecture

- **Entry Point**: `src/index.ts` - Main CLI logic for task distribution and agent coordination
- **Task Definition**: Tasks are defined in JSON files (see `examples/tasks.json`) as arrays of string prompts
- **Workspace Isolation**: Each agent runs in its own Git worktree under `.worktrees/agent-X/`
- **Agent Coordination**: Uses a simple worker pool pattern where agents pull tasks from a shared queue
- **Merge Strategy**: Sequential merging back to main workspace using fast-forward or commit merge

## Key Functions

- `runTask(task: string, id: number)`: Creates worktree, runs claude with task prompt, commits changes, merges back
- `runAgents(tasks: string[], count: number)`: Manages worker pool of agents processing task queue
- `exec(cmd: string, opts)`: Promise-wrapped child_process.spawn for running shell commands

## Development Commands

```bash
# Install dependencies
bun install

# Set up authentication
export ANTHROPIC_API_KEY=your_api_key_here

# Run the CLI tool
bun run start <tasks.json> [-n <agent-count>]

# Direct execution
bun run ./src/index.ts <tasks.json> [-n <agent-count>]
```

## Task File Format

Tasks are defined as JSON arrays of string prompts:
```json
[
  "Add logging to the project",
  "Write unit tests for the CLI"
]
```

## Git Worktree Management

- Worktrees are created from current branch under `.worktrees/agent-X`
- Each agent commits its changes with message format: `agent-X: <task>`
- Merges happen sequentially to prevent conflicts
- Worktrees are automatically cleaned up after merge

## Runtime Dependencies

- Requires `claude` CLI tool available in PATH
- Requires ANTHROPIC_API_KEY environment variable for authentication
- Uses `bun` as the runtime and package manager
- Git worktree functionality for workspace isolation