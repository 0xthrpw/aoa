#!/usr/bin/env bun
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

interface ClaudeConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  additionalArgs?: string[];
}

interface Config {
  claude?: ClaudeConfig;
}

function loadConfig(configPath?: string): Config {
  if (!configPath) return {};
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent) as Config;
  } catch (error) {
    console.warn(`Warning: Could not load config from ${configPath}:`, error);
    return {};
  }
}

function buildClaudeCommand(task: string, config: ClaudeConfig = {}): string {
  const args = ['claude'];
  
  if (config.model) {
    args.push('--model', config.model);
  }
  
  if (config.maxTokens) {
    args.push('--max-tokens', config.maxTokens.toString());
  }
  
  if (config.temperature !== undefined) {
    args.push('--temperature', config.temperature.toString());
  }
  
  if (config.additionalArgs) {
    args.push(...config.additionalArgs);
  }
  
  args.push(`"${task}"`);
  
  return args.join(' ');
}

function exec(cmd: string, opts: { cwd?: string } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, stdio: 'inherit', ...opts });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function runTask(task: string, id: number, config: Config = {}) {
  const base = path.resolve('.worktrees');
  const dir = path.join(base, `agent-${id}`);
  await fs.promises.mkdir(base, { recursive: true });
  // create isolated worktree
  await exec(`git worktree add ${dir}`);
  try {
    // run claude cli with the task prompt and config
    const claudeCmd = buildClaudeCommand(task, config.claude);
    await exec(claudeCmd, { cwd: dir });
    // commit changes inside worktree
    await exec('git add -A', { cwd: dir });
    await exec(`git commit -m "agent-${id}: ${task}"`, { cwd: dir });
    // merge back to main workspace
    await exec(`git merge --ff-only ${path.basename(dir)}`, { cwd: '.' });
  } finally {
    await exec(`git worktree remove ${dir}`);
  }
}

async function runAgents(tasks: string[], count: number, config: Config = {}) {
  let next = 0;
  async function worker(id: number) {
    while (true) {
      const index = next++;
      if (index >= tasks.length) break;
      const task = tasks[index];
      console.log(`Agent ${id} running task: ${task}`);
      await runTask(task, id, config);
    }
  }
  await Promise.all(Array.from({ length: count }, (_, i) => worker(i)));
}

async function main() {
  const [, , cmd, file, ...rest] = process.argv;
  if (cmd !== 'start' || !file) {
    console.error('Usage: aoa start <tasks.json> [-n agents] [-c config.json]');
    process.exit(1);
  }
  
  let agents = 1;
  let configPath: string | undefined;
  
  // Parse command line arguments
  const n = rest.indexOf('-n');
  if (n !== -1 && rest[n + 1]) {
    agents = parseInt(rest[n + 1], 10);
  }
  
  const c = rest.indexOf('-c');
  if (c !== -1 && rest[c + 1]) {
    configPath = rest[c + 1];
  }
  
  const config = loadConfig(configPath);
  const tasks = JSON.parse(fs.readFileSync(file, 'utf8')) as string[];
  await runAgents(tasks, agents, config);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
