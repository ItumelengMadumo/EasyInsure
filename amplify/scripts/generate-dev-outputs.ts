import { spawnSync } from 'node:child_process';

const appId = process.env.AMPLIFY_APP_ID?.trim();
if (!appId) {
  console.error('Set AMPLIFY_APP_ID to the development Amplify application ID.');
  process.exit(1);
}
const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(executable, ['ampx', 'generate', 'outputs', '--app-id', appId, '--branch', 'dev'], {
  stdio: 'inherit',
  shell: false,
});
process.exit(result.status ?? 1);
