#!/usr/bin/env bun
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function exec(cmd: string, opts: { cwd?: string } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, stdio: 'inherit', ...opts });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function runTask(task: string, id: number) {
  const base = path.resolve('.worktrees');
  const dir = path.join(base, `agent-${id}`);
  await fs.promises.mkdir(base, { recursive: true });
  // create isolated worktree
  await exec(`git worktree add ${dir}`);
  try {
    // run claude cli with the task prompt
    await exec(`claude "${task}"`, { cwd: dir });
    // commit changes inside worktree
    await exec('git add -A', { cwd: dir });
    await exec(`git commit -m "agent-${id}: ${task}"`, { cwd: dir });
    // merge back to main workspace
    await exec(`git merge --ff-only ${path.basename(dir)}`, { cwd: '.' });
  } finally {
    await exec(`git worktree remove ${dir}`);
  }
}

async function runAgents(tasks: string[], count: number) {
  let next = 0;
  async function worker(id: number) {
    while (true) {
      const index = next++;
      if (index >= tasks.length) break;
      const task = tasks[index];
      console.log(`Agent ${id} running task: ${task}`);
      await runTask(task, id);
    }
  }
  await Promise.all(Array.from({ length: count }, (_, i) => worker(i)));
}

async function main() {
  // Check for Claude authentication
//   if (!process.env.ANTHROPIC_API_KEY) {
//     console.error('Error: ANTHROPIC_API_KEY environment variable is required for Claude Code authentication');
//     console.error('Please set your API key: export ANTHROPIC_API_KEY=your_api_key_here');
//     process.exit(1);
//   }

  console.log(process.argv)
  const [, , file, ...rest] = process.argv;
  if (!file) {
    console.error('Usage: bun run start <tasks.json> [-n agents]');
    process.exit(1);
  }
  let agents = 1;
  const n = rest.indexOf('-n');
  if (n !== -1 && rest[n + 1]) {
    agents = parseInt(rest[n + 1], 10);
  }
  console.log(`file: ${file}, agents: ${agents}`);
  const tasks = JSON.parse(fs.readFileSync(file, 'utf8')) as string[];
  await runAgents(tasks, agents);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
