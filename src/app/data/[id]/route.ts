import {
  readSavedDataset,
  ServingCapacityError,
} from '@/server/serving-reader';
import { sourceSelection } from '@/domain/filters';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id))
    return new Response(null, { status: 400 });
  const query = new URL(request.url).searchParams;
  let source = query.get('source') ?? 'all';
  const sheet = query.get('sheet') ?? 'all',
    size = Number(query.get('size') ?? 0);
  const official = query.get('official') ?? 'false';
  if (!['all', 'open', 'closed'].includes(sheet) || ![0, 100].includes(size))
    return new Response(null, { status: 400 });
  if (!['false', 'true'].includes(official))
    return new Response(null, { status: 400 });
  try {
    source = sourceSelection(source);
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    const output = await readSavedDataset({
      id,
      source,
      sheet,
      minPlayers: size,
      official: official === 'true',
    });
    if (output.status !== 200)
      return new Response(null, { status: output.status });
    // A provider can disappear from a new publication. The saved selection gets an honest empty cohort.
    return new Response(output.body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': output.cacheable
          ? 'private, max-age=31536000, immutable'
          : 'private, no-store',
      },
    });
  } catch (error) {
    return new Response(null, {
      status: error instanceof ServingCapacityError ? 429 : 503,
      headers: { 'Retry-After': '1' },
    });
  }
}
