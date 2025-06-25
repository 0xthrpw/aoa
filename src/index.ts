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
  autoApprove?: boolean;
}

interface Config {
  claude?: ClaudeConfig;
  projectDir?: string;
  interactive?: boolean;
  autoApprove?: boolean;
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

function buildClaudeCommand(task: string, config: ClaudeConfig = {}, globalConfig: Config = {}): string {
  const args = ['claude'];
  
  // Add --print for non-interactive mode (required for agents)
  if (!globalConfig.interactive) {
    args.push('--print');
  }
  
  if (config.model) {
    args.push('--model', config.model);
  }
  
  if (config.maxTokens) {
    args.push('--max-tokens', config.maxTokens.toString());
  }
  
  if (config.temperature !== undefined) {
    args.push('--temperature', config.temperature.toString());
  }
  
  // Add auto-approve if enabled
  if (config.autoApprove || globalConfig.autoApprove) {
    args.push('--dangerously-skip-permissions');
    // Note: --allowedTools syntax was causing issues, --dangerously-skip-permissions should be sufficient
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

async function getCurrentBranch(dir: string): Promise<string> {
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const { spawn } = require('child_process');
      const child = spawn('git', ['branch', '--show-current'], { cwd: dir, stdio: 'pipe' });
      let result = '';
      child.stdout.on('data', (data: Buffer) => result += data.toString());
      child.on('close', (code: number) => {
        if (code === 0) resolve(result.trim());
        else reject(new Error(`git branch --show-current failed`));
      });
    });
    return output;
  } catch {
    // Fallback to parsing git status
    try {
      const output = await new Promise<string>((resolve, reject) => {
        const { spawn } = require('child_process');
        const child = spawn('git', ['status', '--porcelain=v1', '--branch'], { cwd: dir, stdio: 'pipe' });
        let result = '';
        child.stdout.on('data', (data: Buffer) => result += data.toString());
        child.on('close', (code: number) => {
          if (code === 0) resolve(result);
          else reject(new Error(`git status failed`));
        });
      });
      const match = output.match(/## ([^.\s]+)/);
      if (match) return match[1];
    } catch {
      // Ultimate fallback
    }
    return 'main'; // Default fallback
  }
}

async function pullLatestChanges(dir: string, agentId: number, projectDir: string): Promise<void> {
  try {
    console.log(`[Agent ${agentId}] Pulling latest changes...`);
    
    // Get the current branch from the main project directory
    const currentBranch = await getCurrentBranch(projectDir);
    console.log(`[Agent ${agentId}] Syncing with ${currentBranch} branch...`);
    
    // Fetch latest changes
    await exec('git fetch origin', { cwd: dir });
    
    // Pull from the same branch the main project is on
    await exec(`git pull origin ${currentBranch}`, { cwd: dir });
    console.log(`[Agent ${agentId}] Successfully synced with latest changes`);
  } catch (error) {
    console.warn(`[Agent ${agentId}] Warning: Could not sync with remote (this is often normal for new repos):`, error);
  }
}

function exec(cmd: string, opts: { cwd?: string; agentId?: number; interactive?: boolean } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const { agentId, interactive, ...spawnOpts } = opts;
    
    // For Claude commands running in agents, use separate stdio to avoid terminal interference
    const isClaudeCommand = cmd.includes('claude');
    
    if (isClaudeCommand && agentId !== undefined) {
      if (interactive) {
        // Interactive mode: inherit stdio for direct user interaction
        const child = spawn(cmd, [], { 
          shell: true, 
          stdio: 'inherit',
          ...spawnOpts 
        });
        
        console.log(`\n🤖 [Agent ${agentId}] Starting interactive task...`);
        console.log(`📝 Task: ${cmd.split('"')[1] || 'Unknown task'}`);
        console.log(`💡 You can respond to any prompts from Claude directly.\n`);
        
        child.on('close', (code: number | null) => {
          if (code === 0) {
            console.log(`\n✅ [Agent ${agentId}] Interactive task completed successfully`);
            resolve();
          } else {
            console.error(`\n❌ [Agent ${agentId}] Interactive task failed with exit code ${code}`);
            reject(new Error(`Agent ${agentId}: ${cmd} exited with code ${code}`));
          }
        });
      } else {
        // Non-interactive mode: capture and prefix output
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
      }
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
    // Check if the worktree contains a git repo and sync with current branch if it does
    if (await isGitRepo(dir) && await hasRemoteOrigin(dir)) {
      await pullLatestChanges(dir, id, projectDir);
    }
    
    // run claude cli with the task prompt and config
    const claudeCmd = buildClaudeCommand(task, config.claude, config);
    
    // Debug: show the command being executed
    if (config.autoApprove) {
      console.log(`[Agent ${id}] Running with auto-approve: ${claudeCmd}`);
    }
    
    await exec(claudeCmd, { cwd: dir, agentId: id, interactive: config.interactive });
    
    // commit changes inside worktree
    await exec('git add -A', { cwd: dir });
    
    // Check if there are any changes to commit
    let hasChanges = false;
    try {
      await exec('git diff --cached --exit-code', { cwd: dir });
      console.log(`[Agent ${id}] No changes to commit`);
    } catch {
      // There are changes to commit
      hasChanges = true;
    }
    
    if (hasChanges) {
      // Ensure git user configuration for commits
      try {
        await exec('git config user.name', { cwd: dir });
      } catch {
        await exec('git config user.name "Army of Agents"', { cwd: dir });
      }
      
      try {
        await exec('git config user.email', { cwd: dir });
      } catch {
        await exec('git config user.email "aoa@localhost"', { cwd: dir });
      }
      
      // Commit with proper error handling
      try {
        await exec(`git commit -m "agent-${id}: ${task}"`, { cwd: dir });
        console.log(`[Agent ${id}] Changes committed successfully`);
      } catch (error) {
        console.error(`[Agent ${id}] Failed to commit changes:`, error);
        throw error;
      }
      
      // merge back to main workspace
      await exec(`git merge --ff-only ${path.basename(dir)}`, { cwd: projectDir });
    }
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
    console.error('Usage: aoa start <tasks.json> [options]');
    console.error('Options:');
    console.error('  -n <count>              Number of agents (default: 1)');
    console.error('  -c <config.json>        Configuration file path');
    console.error('  --project-dir <path>    Target project directory (default: current)');
    console.error('  --interactive           Enable interactive mode for agent questions');
    console.error('  --auto-approve          Auto-approve all agent actions without prompting');
    process.exit(1);
  }
  
  let agents = 1;
  let configPath: string | undefined;
  let projectDir: string | undefined;
  let interactive = false;
  let autoApprove = false;
  
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
  
  // Check for interactive mode
  if (rest.includes('--interactive')) {
    interactive = true;
    if (agents > 1) {
      console.warn('Warning: Interactive mode is only supported with single agent (-n 1). Setting agents to 1.');
      agents = 1;
    }
  }
  
  // Check for auto-approve mode
  if (rest.includes('--auto-approve')) {
    autoApprove = true;
  }
  
  // Interactive and auto-approve are mutually exclusive
  if (interactive && autoApprove) {
    console.error('Error: --interactive and --auto-approve cannot be used together');
    process.exit(1);
  }
  
  // Validate the project directory
  await validateProjectDirectory(projectDir);
  
  const config = loadConfig(configPath, projectDir);
  
  // Override config with CLI flags
  config.interactive = interactive;
  config.autoApprove = autoApprove;
  
  // Log the mode being used
  if (interactive) {
    console.log('🔄 Running in interactive mode - you can respond to agent questions');
  } else if (autoApprove) {
    console.log('🤖 Running in auto-approve mode - agents will proceed without asking permission');
  }
  
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
