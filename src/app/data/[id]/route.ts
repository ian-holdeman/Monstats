import {
  readSavedDataset,
  ServingCapacityError,
} from '@/server/serving-reader';
import { sourceSelection } from '@/domain/filters';
import { acceptsGzip } from '@/server/response-encoding';
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
  const detail = query.get('detail') ?? undefined;
  if (detail && !/^[a-z0-9]{1,80}$/.test(detail))
    return new Response(null, { status: 400 });
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
    const gzip = acceptsGzip(request.headers.get('accept-encoding'));
    const output = await readSavedDataset({
      id,
      source,
      sheet,
      minPlayers: size,
      official: official === 'true',
      gzip,
      detail,
    });
    if (output.status !== 200)
      return new Response(null, { status: output.status });
    // A provider can disappear from a new publication. The saved selection gets an honest empty cohort.
    return new Response(output.body, {
      headers: {
        'Content-Type': 'application/json',
        Vary: 'Accept-Encoding',
        ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
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
