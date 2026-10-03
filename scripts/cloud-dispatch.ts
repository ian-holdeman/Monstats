import { createServer } from 'node:http';
import { cloudStorage, GcsControlStorage } from '../src/server/cloud/storage';
import { dispatchDue } from '../src/server/cloud/dispatch';

const project = process.env.GOOGLE_CLOUD_PROJECT;
const region = process.env.MONSTATS_REGION;
const job = process.env.MONSTATS_WRITER_JOB;
const bucket = process.env.MONSTATS_CONTROL_BUCKET;
if (![project, region, job, bucket].every((s) => s && /^[a-z0-9-]+$/.test(s)))
  throw new Error('Invalid dispatcher configuration');
const storage = cloudStorage();
const control = new GcsControlStorage(storage.bucket(bucket!));
const server = createServer(async (request, response) => {
  // Cloud Run IAM authenticates this separate service. Do not expose it through
  // the public Next service or disable its invoker check.
  if (request.method !== 'POST' || request.url !== '/dispatch') {
    response.writeHead(404).end();
    return;
  }
  try {
    const started = await dispatchDue(control, async () => {
      const auth = await storage.authClient.getClient();
      await auth.request({
        url: `https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${job}:run`,
        method: 'POST',
        data: {},
        timeout: 30000,
      });
    });
    response
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ started }));
  } catch {
    response.writeHead(503).end();
  }
});
server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
process.once('SIGTERM', () => server.close());
