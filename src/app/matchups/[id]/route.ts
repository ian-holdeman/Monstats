import { readMatchups } from '@/server/matchup-reader';
import type { MatchupRequest } from '@/domain/dynamic-matchups';
import { readRequestBody, RequestBodyError } from '@/server/request-body';
export const dynamic = 'force-dynamic';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id))
    return Response.json({ error: 'Invalid publication' }, { status: 400 });
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !==
    'application/json'
  )
    return Response.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 },
    );
  try {
    const body = await readRequestBody(request);
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
    if (error instanceof RequestBodyError)
      return Response.json({ error: error.message }, { status: error.status });
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
