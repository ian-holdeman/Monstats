import { existsSync } from 'node:fs';
import { databasePath } from '@/server/paths';
import { Store } from '@/server/store';
import { publicDataset } from '@/server/reader';
import { sourceSelection } from '@/domain/filters';
import { EVIDENCE_VERSION } from '@/domain/evidence';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id))
    return new Response(null, { status: 400 });
  const query = new URL(request.url).searchParams;
  const source = query.get('source') ?? 'all',
    sheet = query.get('sheet') ?? 'all',
    size = Number(query.get('size') ?? 0);
  const official = query.get('official') ?? 'false';
  if (!['all', 'open', 'closed'].includes(sheet) || ![0, 100].includes(size))
    return new Response(null, { status: 400 });
  if (!['false', 'true'].includes(official))
    return new Response(null, { status: 400 });
  try {
    sourceSelection(source);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!existsSync(databasePath())) return new Response(null, { status: 404 });
  const store = new Store(databasePath(), true);
  try {
    const d = store.version(id);
    if (!d) return new Response(null, { status: 404 });
    const output = publicDataset(
      d,
      source,
      sheet,
      size,
      official === 'true',
      store.db,
    );
    const readyEvidence = Object.values(output.views).every((v) =>
      v.pokemon.every((r) => r.evidence?.version === EVIDENCE_VERSION),
    );
    // A provider can disappear from a new publication. The saved selection gets an honest empty cohort.
    return Response.json(output, {
      headers: {
        'Cache-Control': readyEvidence
          ? 'private, max-age=31536000, immutable'
          : 'private, no-store',
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  } finally {
    store.close();
  }
}
