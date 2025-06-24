import * as mod from '../src/index';
import { expect, test, vi } from 'bun:test';

test('runAgents distributes tasks across workers', async () => {
  const tasks: string[] = [];
  const runTask = vi.fn(async (task: string) => {
    tasks.push(task);
  });

  const spy = vi.spyOn(mod, 'runTask').mockImplementation(runTask);

  await mod.runAgents(['t1', 't2', 't3'], 2);

  spy.mockRestore();

  expect(runTask).toHaveBeenCalledTimes(3);
  expect(tasks).toEqual(['t1', 't2', 't3']);
});
