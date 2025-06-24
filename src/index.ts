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

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await exec('git rev-parse --git-dir', { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

async function hasRemoteOrigin(dir: string): Promise<boolean> {
  try {
    await exec('git remote get-url origin', { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

async function pullMasterBranch(dir: string, agentId: number): Promise<void> {
  try {
    console.log(`[Agent ${agentId}] Pulling latest changes from master...`);
    await exec('git fetch origin', { cwd: dir });
    await exec('git pull origin master', { cwd: dir });
    console.log(`[Agent ${agentId}] Successfully pulled latest changes`);
  } catch (error) {
    console.warn(`[Agent ${agentId}] Warning: Could not pull from master:`, error);
  }
}

function exec(cmd: string, opts: { cwd?: string; agentId?: number } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const { agentId, ...spawnOpts } = opts;
    
    // For Claude commands running in agents, use separate stdio to avoid terminal interference
    const isClaudeCommand = cmd.includes('claude');
    const stdio = isClaudeCommand && agentId !== undefined 
      ? ['ignore', 'pipe', 'pipe'] as const  // stdin ignored, stdout/stderr piped
      : 'inherit';
    
    const child = spawn(cmd, { shell: true, stdio, ...spawnOpts });
    
    // Handle output for Claude commands
    if (isClaudeCommand && agentId !== undefined) {
      let stdout = '';
      let stderr = '';
      
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          const output = data.toString();
          stdout += output;
          // Stream output in real-time with agent prefix
          process.stdout.write(`[Agent ${agentId}] ${output}`);
        });
      }
      
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          const output = data.toString();
          stderr += output;
          // Stream error output in real-time with agent prefix
          process.stderr.write(`[Agent ${agentId}] ${output}`);
        });
      }
      
      child.on('close', (code) => {
        if (code === 0) {
          console.log(`[Agent ${agentId}] Task completed successfully`);
          resolve();
        } else {
          console.error(`[Agent ${agentId}] Task failed with exit code ${code}`);
          reject(new Error(`Agent ${agentId}: ${cmd} exited with code ${code}`));
        }
      });
    } else {
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${cmd} exited with code ${code}`));
      });
    }
  });
}

async function runTask(task: string, id: number, config: Config = {}) {
  const base = path.resolve('.worktrees');
  const dir = path.join(base, `agent-${id}`);
  await fs.promises.mkdir(base, { recursive: true });
  // create isolated worktree
  await exec(`git worktree add ${dir}`);
  try {
    // Check if the worktree contains a git repo and pull from master if it does
    if (await isGitRepo(dir) && await hasRemoteOrigin(dir)) {
      await pullMasterBranch(dir, id);
    }
    
    // run claude cli with the task prompt and config
    const claudeCmd = buildClaudeCommand(task, config.claude);
    await exec(claudeCmd, { cwd: dir, agentId: id });
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
