import { existsSync } from 'node:fs';
import { Store } from '@/server/store';
import { LadderStore } from '@/server/ladder-store';
import { databasePath } from '@/server/paths';
import { BoundedCache } from '@/domain/bounded-cache';
import type { LadderDataset } from '@/domain/ladder';
import { withReadSnapshot } from '@/server/cloud/reader';
// The two most recently viewed immutable publications remain decoded across detail reads.
const versions = new BoundedCache<LadderDataset>(2);
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await withReadSnapshot(() => readLadder(request, context));
  } catch {
    return Response.json(
      { error: 'Saved ladder unavailable' },
      { status: 503 },
    );
  }
}
async function readLadder(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-f0-9]{16}$/.test(id))
    return Response.json({ error: 'Invalid publication' }, { status: 400 });
  if (!existsSync(databasePath()))
    return Response.json(
      { error: 'Saved ladder unavailable' },
      { status: 404 },
    );
  let store: Store | undefined;
  try {
    store = new Store(databasePath(), true);
    const key = `${databasePath()}:${id}`;
    const dataset = versions.get(key) ?? new LadderStore(store).version(id);
    if (dataset) versions.set(key, dataset);
    if (!dataset)
      return Response.json(
        { error: 'Saved ladder unavailable' },
        { status: 404 },
      );
    const { snapshots, excluded, ...publicData } = dataset;
    const pokemon = new URL(request.url).searchParams.get('pokemon');
    if (pokemon !== null) {
      if (!/^[a-z0-9]+$/.test(pokemon))
        return Response.json({ error: 'Invalid Pokémon' }, { status: 400 });
      const row = dataset.rows.find((r) => r.id === pokemon);
      if (!row)
        return Response.json(
          { error: 'Pokémon not in this cohort' },
          { status: 404 },
        );
      return Response.json(
        { publication: dataset.id, row },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json(
      {
        ...publicData,
        rows: dataset.rows.map((row) => ({
          ...row,
          builds: {},
          trend: undefined,
        })),
        excludedCount: excluded.length,
        sources: [...new Set(snapshots.map((s) => s.url))],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Saved ladder could not be read' },
      { status: 500 },
    );
  } finally {
    store?.close();
  }
}
