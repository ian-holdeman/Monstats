import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const configPath = resolve('.monstats/local-config.json');
const config = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, 'utf8'))
  : {};
const directory = resolve(config.dataDirectory ?? '.monstats/local-latest');
if (!existsSync(resolve(directory, 'monstats.sqlite')))
  throw new Error(
    'No local publication. Import a verified snapshot first; see docs/local-development.md.',
  );
if (!existsSync('.next/BUILD_ID'))
  throw new Error('Build the local release first: npm run build');
const env = { ...process.env, MONSTATS_DATA_DIR: directory };
delete env.MONSTATS_CONTROL_BUCKET;
delete env.MONSTATS_SERVING_BUCKET;
const child = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(config.port ?? 3200),
  ],
  { env, stdio: 'inherit', windowsHide: true },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
