#!/usr/bin/env node
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
  projectDir?: string;
}

function loadConfig(configPath?: string, projectDir?: string): Config {
  if (!configPath) {
    // Try to find config in project directory
    if (projectDir) {
      const projectConfigPath = path.join(projectDir, 'aoa.config.json');
      if (fs.existsSync(projectConfigPath)) {
        configPath = projectConfigPath;
      } else {
        // Try package.json aoa field
        const packageJsonPath = path.join(projectDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            if (packageJson.aoa) {
              return { ...packageJson.aoa, projectDir };
            }
          } catch {
            // Ignore package.json parsing errors
          }
        }
      }
    }
  }
  
  if (!configPath) return { projectDir };
  
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent) as Config;
    return { ...config, projectDir };
  } catch (error) {
    console.warn(`Warning: Could not load config from ${configPath}:`, error);
    return { projectDir };
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
    
    if (isClaudeCommand && agentId !== undefined) {
      // Use piped stdio for Claude commands to capture output
      const child = spawn(cmd, [], { 
        shell: true, 
        stdio: ['ignore', 'pipe', 'pipe'],
        ...spawnOpts 
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        stdout += output;
        // Stream output in real-time with agent prefix
        process.stdout.write(`[Agent ${agentId}] ${output}`);
      });
      
      child.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        stderr += output;
        // Stream error output in real-time with agent prefix
        process.stderr.write(`[Agent ${agentId}] ${output}`);
      });
      
      child.on('close', (code: number | null) => {
        if (code === 0) {
          console.log(`[Agent ${agentId}] Task completed successfully`);
          resolve();
        } else {
          console.error(`[Agent ${agentId}] Task failed with exit code ${code}`);
          reject(new Error(`Agent ${agentId}: ${cmd} exited with code ${code}`));
        }
      });
    } else {
      // Use inherit stdio for non-Claude commands
      const child = spawn(cmd, [], { 
        shell: true, 
        stdio: 'inherit',
        ...spawnOpts 
      });
      
      child.on('close', (code: number | null) => {
        if (code === 0) resolve();
        else reject(new Error(`${cmd} exited with code ${code}`));
      });
    }
  });
}

async function runTask(task: string, id: number, config: Config = {}) {
  const projectDir = config.projectDir || process.cwd();
  const base = path.resolve(projectDir, '.worktrees');
  const dir = path.join(base, `agent-${id}`);
  await fs.promises.mkdir(base, { recursive: true });
  // create isolated worktree
  await exec(`git worktree add ${dir}`, { cwd: projectDir });
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
    await exec(`git merge --ff-only ${path.basename(dir)}`, { cwd: projectDir });
  } finally {
    await exec(`git worktree remove ${dir}`, { cwd: projectDir });
  }
}

async function runAgents(tasks: string[], count: number, config: Config = {}) {
  const projectDir = config.projectDir || process.cwd();
  console.log(`Working in project directory: ${projectDir}`);
  
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

async function validateProjectDirectory(projectDir: string): Promise<void> {
  if (!fs.existsSync(projectDir)) {
    throw new Error(`Project directory does not exist: ${projectDir}`);
  }
  
  const stat = fs.statSync(projectDir);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${projectDir}`);
  }
  
  // Check if it's a git repository
  if (!await isGitRepo(projectDir)) {
    console.warn(`Warning: ${projectDir} is not a git repository. Some features may not work as expected.`);
  }
}

export async function main() {
  const [, , cmd, file, ...rest] = process.argv;
  if (cmd !== 'start' || !file) {
    console.error('Usage: aoa start <tasks.json> [-n agents] [-c config.json] [--project-dir path]');
    process.exit(1);
  }
  
  let agents = 1;
  let configPath: string | undefined;
  let projectDir: string | undefined;
  
  // Parse command line arguments
  const n = rest.indexOf('-n');
  if (n !== -1 && rest[n + 1]) {
    agents = parseInt(rest[n + 1], 10);
  }
  
  const c = rest.indexOf('-c');
  if (c !== -1 && rest[c + 1]) {
    configPath = rest[c + 1];
  }
  
  const p = rest.indexOf('--project-dir');
  if (p !== -1 && rest[p + 1]) {
    projectDir = path.resolve(rest[p + 1]);
  } else {
    projectDir = process.cwd();
  }
  
  // Validate the project directory
  await validateProjectDirectory(projectDir);
  
  const config = loadConfig(configPath, projectDir);
  
  // Resolve task file path relative to project directory or current directory
  const taskFilePath = path.isAbsolute(file) ? file : path.resolve(projectDir, file);
  if (!fs.existsSync(taskFilePath)) {
    throw new Error(`Task file does not exist: ${taskFilePath}`);
  }
  
  const tasks = JSON.parse(fs.readFileSync(taskFilePath, 'utf8')) as string[];
  await runAgents(tasks, agents, config);
}

// Export for CLI usage, but don't run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
