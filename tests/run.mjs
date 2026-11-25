import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'splittrack-test-'));
try {
  const result = spawnSync(process.execPath, [
    'node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2),
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      TRIPTRACK_TEST_DATA: join(directory, 'trips.json'),
      TRIPTRACK_TEST_BROWSER: process.env.TRIPTRACK_TEST_BROWSER ?? (process.platform === 'win32' ? 'msedge' : ''),
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(join(directory, 'trips.json'), { force: true });
  rmSync(join(directory, 'trips.json.tmp'), { force: true });

  rmdirSync(directory);
}


