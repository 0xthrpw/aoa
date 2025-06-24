import { exec } from '../src/index';
import { expect, test } from 'bun:test';

test('exec resolves on success', async () => {
  await exec('echo hello');
});

test('exec rejects on failure', async () => {
  await expect(exec('false')).rejects.toThrow();
});
