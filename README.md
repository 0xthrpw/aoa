# Army of Agents (AOA)

A TypeScript CLI tool that dispatches multiple Claude agents to work on tasks in parallel using Git worktrees. AOA allows you to install it as a package and use it to modify any project's files through coordinated AI agents.

## Features

- 🤖 **Multiple Claude Agents**: Run multiple Claude instances in parallel
- 🔀 **Git Worktree Isolation**: Each agent works in isolated Git worktrees
- 📦 **Package Installation**: Install globally or locally in any project
- ⚙️ **Configurable**: Support for project-specific configurations
- 🔄 **Auto-sync**: Automatically pulls latest changes from master branch
- 🎯 **Project-aware**: Works with any Git repository

## Installation

### Global Installation
```bash
npm install -g army-of-agents
```

### Local Installation (Recommended)
```bash
cd /path/to/your/project
npm install --save-dev army-of-agents
```

## Quick Start

### 1. Create a Task File
Create `tasks.json` in your project:
```json
[
  "Add error handling to the API endpoints",
  "Update documentation for the new features",
  "Add unit tests for the utility functions"
]
```

### 2. Run AOA
```bash
# Global installation
aoa start tasks.json --project-dir /path/to/your/project

# Local installation (from project directory)
npx aoa start tasks.json

# Or via npm scripts
npm run aoa start tasks.json
```

## Usage

### Basic Usage
```bash
aoa start <tasks.json> [options]
```

### Options
- `-n <count>`: Number of agents to run (default: 1)
- `-c <config.json>`: Path to configuration file
- `--project-dir <path>`: Target project directory (default: current directory)

### Examples
```bash
# Run 3 agents on tasks.json in current directory
npx aoa start tasks.json -n 3

# Run with custom config in different project
aoa start ./my-tasks.json -c ./aoa-config.json --project-dir /path/to/project

# Run single agent with specific project
aoa start tasks.json --project-dir ~/my-react-app
```

## Configuration

### Configuration File
Create `aoa.config.json` in your project root:
```json
{
  "claude": {
    "model": "claude-3-5-sonnet-20241022",
    "maxTokens": 4096,
    "temperature": 0.7,
    "additionalArgs": [
      "--memory-path=./memory",
      "--verbose"
    ]
  }
}
```

### package.json Configuration
Alternatively, add configuration to your `package.json`:
```json
{
  "aoa": {
    "claude": {
      "model": "claude-3-5-sonnet-20241022",
      "maxTokens": 2048
    }
  }
}
```

### Configuration Options
- `model`: Claude model to use
- `maxTokens`: Maximum response tokens
- `temperature`: Creativity level (0.0-1.0)
- `additionalArgs`: Extra CLI arguments for Claude

## Authentication

AOA requires the Claude CLI to be installed and authenticated:

```bash
# Install Claude CLI (if not already installed)
npm install -g @anthropic-ai/claude-cli

# Authenticate (if not already done)
claude auth login
```

## How It Works

1. **Worktree Creation**: AOA creates isolated Git worktrees for each agent
2. **Task Distribution**: Tasks are distributed among available agents
3. **Parallel Execution**: Each agent runs Claude with its assigned task
4. **Auto-sync**: Agents automatically pull latest changes before starting
5. **Sequential Merging**: Changes are merged back sequentially to prevent conflicts
6. **Cleanup**: Worktrees are automatically cleaned up after completion

## Project Integration

### Adding to Existing Projects
```bash
cd your-existing-project
npm install --save-dev army-of-agents

# Create tasks file
echo '["Add TypeScript definitions", "Update README"]' > aoa-tasks.json

# Run
npx aoa start aoa-tasks.json -n 2
```

### npm Scripts Integration
Add to your `package.json`:
```json
{
  "scripts": {
    "aoa": "aoa start",
    "aoa:dev": "aoa start dev-tasks.json -n 3",
    "aoa:docs": "aoa start doc-tasks.json -c aoa-docs.config.json"
  }
}
```

## Task File Examples

### Simple Tasks
```json
[
  "Fix TypeScript errors in src/utils",
  "Add JSDoc comments to public API functions",
  "Update package.json dependencies"
]
```

### Complex Tasks
```json
[
  "Implement user authentication using JWT tokens with proper error handling",
  "Create comprehensive unit tests for the payment processing module",
  "Refactor the database layer to use async/await pattern consistently"
]
```

## Safety Features

- **Git Repository Validation**: Ensures target directory is a Git repository
- **Directory Validation**: Validates project directory exists and is accessible
- **Task File Validation**: Ensures task file exists and is valid JSON
- **Worktree Isolation**: Each agent works in complete isolation
- **Error Handling**: Graceful handling of agent failures and cleanup

## Troubleshooting

### Common Issues

**"claude: command not found"**
- Install Claude CLI: `npm install -g @anthropic-ai/claude-cli`
- Ensure it's in your PATH

**"Project directory is not a git repository"**
- Initialize git: `git init`
- Or specify a different project directory

**"Task file does not exist"**
- Check the path to your tasks.json file
- Use absolute paths if needed

### Debug Mode
```bash
# Run with verbose output
aoa start tasks.json -c config.json --verbose
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Links

- [Repository](https://github.com/yourusername/army-of-agents)
- [Issues](https://github.com/yourusername/army-of-agents/issues)
- [Claude CLI Documentation](https://docs.anthropic.com/claude/docs)