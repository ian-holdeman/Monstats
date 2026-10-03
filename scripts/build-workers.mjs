import { build } from 'esbuild';
await build({
  entryPoints: [
    'daily',
    'ingest',
    'ladder-worker',
    'ingest-ladder',
    'operations',
    'backfill-regulation',
    'sprites',
    'activate',
    'serving-reader',
  ].map((n) => `scripts/${n}.ts`),
  outdir: 'dist/workers',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
});
