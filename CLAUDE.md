# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Army of Agents (AOA) is a TypeScript CLI tool that dispatches multiple Claude agents to work on tasks in parallel. The tool coordinates agents using Git worktrees to prevent concurrent workspace conflicts. It can be installed as an npm package and used to modify other projects' files.

## Core Architecture

- **Entry Point**: `src/index.ts` - Main CLI logic for task distribution and agent coordination
- **CLI Executable**: `src/cli.ts` - Executable entry point for npm bin
- **Task Definition**: Tasks are defined in JSON files as arrays of string prompts
- **Workspace Isolation**: Each agent runs in its own Git worktree under `<project>/.worktrees/agent-X/`
- **Agent Coordination**: Uses a simple worker pool pattern where agents pull tasks from a shared queue
- **Merge Strategy**: Sequential merging back to main workspace using fast-forward or commit merge
- **Project-aware**: Works with any target project directory via `--project-dir` option

## Key Functions

- `runTask(task: string, id: number, config: Config)`: Creates worktree in target project, runs claude with task prompt, commits changes, merges back
- `runAgents(tasks: string[], count: number, config: Config)`: Manages worker pool of agents processing task queue
- `validateProjectDirectory(projectDir: string)`: Validates target project directory exists and is a git repo
- `loadConfig(configPath?: string, projectDir?: string)`: Loads configuration from project-specific files
- `exec(cmd: string, opts)`: Promise-wrapped child_process.spawn for running shell commands

## Development Commands

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Development mode
npm run dev

# Run in current project
npm run start start tasks.json

# Test installation
npm pack
```

## Package Usage Commands

```bash
# After building
npm run build

# Global installation testing
npm install -g .
aoa start tasks.json --project-dir /path/to/project

# Local installation testing
cd /some/other/project
npm install /path/to/aoa/package
npx aoa start tasks.json
```

## Task File Format

Tasks are defined as JSON arrays of string prompts:
```json
[
  "Add logging to the project",
  "Write unit tests for the CLI"
]
```

## Configuration Discovery

AOA looks for configuration in the following order:
1. Explicit `-c config.json` path
2. `<project-dir>/aoa.config.json`
3. `<project-dir>/package.json` aoa field

Configuration format:
```json
{
  "claude": {
    "model": "claude-3-5-sonnet-20241022",
    "maxTokens": 4096,
    "temperature": 0.7,
    "additionalArgs": ["--memory-path=./memory"]
  }
}
```

## Git Worktree Management

- Worktrees are created from current branch under `<project-dir>/.worktrees/agent-X`
- Each agent commits its changes with message format: `agent-X: <task>`
- Merges happen sequentially to prevent conflicts
- Worktrees are automatically cleaned up after merge
- Auto-pulls from master branch if remote origin exists

## Package Structure

```
dist/           # Compiled JavaScript output
├── index.js    # Main logic
├── index.d.ts  # Type definitions
├── cli.js      # CLI executable
└── cli.d.ts    # CLI type definitions

src/           # TypeScript source
├── index.ts   # Main logic
└── cli.ts     # CLI entry point
```

## Runtime Dependencies

- Requires `claude` CLI tool available in PATH
- Uses Node.js (>=18.0.0) as runtime
- Git worktree functionality for workspace isolation
- Target project must be a Git repository

## Build System

- TypeScript compilation to `dist/` directory
- ES modules output format
- Declaration files generated
- npm scripts for development and publishing