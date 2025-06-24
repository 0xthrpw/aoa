# aoa

Army of Agents (AOA) is a simple tool for dispatching multiple Claude
agents to work on a list of tasks in parallel.  The CLI is written in
TypeScript and coordinates the agents so they do not modify the same
workspace concurrently.

## Design Plan

1. **Project setup**
   - Node/TypeScript project using `bun` for running scripts.
   - The CLI entry point is `src/index.ts`.

2. **Task description file**
   - Tasks are stored in a JSON file (see `examples/tasks.json`).
   - Each entry is a string prompt that will be forwarded to a Claude
     agent.

3. **Starting a job**
   - Run `bun run aoa start <tasks.json> -n <agents>` to start a job.
   - The number of agents defaults to `1` when not specified.

4. **Workspace isolation**
   - Every agent works in its own Git worktree under `.worktrees/agent-X`.
   - Worktrees are created from the current branch so changes do not
     conflict.

5. **Agent execution**
   - Each agent receives a task, runs `claude` in its worktree and waits for it to finish.
   - When all tasks are processed, worktrees are merged back sequentially.

6. **Simple locking**
   - Only one merge occurs at a time to prevent conflicts.
   - Merges use fast-forward or create a new commit if needed.

7. **Extending the system**
   - Add more CLI commands (e.g. `status`, `stop`).
   - Implement smarter task distribution or support for different prompts per agent.

## Usage

1. Install dependencies:

```bash
bun install

# Set up authentication
export ANTHROPIC_API_KEY=your_api_key_here
```

2. Create a JSON file describing tasks.  Example:

```json
[
  "Add logging to the project",
  "Write unit tests for the CLI"
]
```

3. Start agents:

```bash
bun run aoa start tasks.json -n 2
```

This will spawn two Claude agents working in parallel on the listed tasks.
