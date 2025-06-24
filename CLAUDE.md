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
bun run start <tasks.json> [-n <agent-count>] [-c <config.json>]

# Direct execution
bun run ./src/index.ts <tasks.json> [-n <agent-count>] [-c <config.json>]
```

## Task File Format

Tasks are defined as JSON arrays of string prompts:
```json
[
  "Add logging to the project",
  "Write unit tests for the CLI"
]
```

## Configuration File Format

Claude parameters can be configured using a JSON configuration file:
```json
{
  "claude": {
    "model": "claude-3-5-sonnet-20241022",
    "maxTokens": 4096,
    "temperature": 0.7,
    "timeout": 300000,
    "additionalArgs": [
      "--memory-path=./memory",
      "--verbose"
    ]
  }
}
```

Available configuration options:
- `model`: Claude model to use (e.g., "claude-3-5-sonnet-20241022")
- `maxTokens`: Maximum number of tokens in response
- `temperature`: Controls randomness (0.0-1.0)
- `timeout`: Command timeout in milliseconds
- `additionalArgs`: Array of additional CLI arguments to pass to Claude

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