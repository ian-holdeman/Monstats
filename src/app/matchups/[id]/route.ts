import { readMatchups } from '@/server/matchup-reader';
import type { MatchupRequest } from '@/domain/dynamic-matchups';
export const dynamic = 'force-dynamic';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id))
    return Response.json({ error: 'Invalid publication' }, { status: 400 });
  try {
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return Response.json({ error: 'Request too large' }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    let input: MatchupRequest;
    try {
      input = JSON.parse(body);
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (!input || typeof input !== 'object')
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    const result = await readMatchups(id, input);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const invalid = /Invalid|Unknown/.test(message);
    const capacity = /capacity/.test(message);
    return Response.json(
      {
        error: invalid
          ? message
          : capacity
            ? 'Queries are busy. Try again.'
            : 'Matchup index unavailable. Run the local backfill command or retry.',
      },
      { status: invalid ? 400 : capacity ? 429 : 503 },
    );
  }
}
