import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateArtwork } from '@/server/artwork';
import { dataDirectory } from '@/server/paths';
import { withReadSnapshot } from '@/server/cloud/reader';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-z0-9]+$/.test(id)) return new Response(null, { status: 404 });
  try {
    const bytes = await withReadSnapshot(
      () =>
        readFile(
          /* turbopackIgnore: true */
          resolve(dataDirectory(), 'sprites', `${id}.png`),
        ),
      'sprites',
    );
    await validateArtwork(bytes);
    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    });
  } catch {
    // A local neutral placeholder makes missing artwork explicit without remote requests.
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="23" fill="#252c36" stroke="#6f7c8e" stroke-width="2"/><path d="M25 48h46" stroke="#6f7c8e" stroke-width="2"/><circle cx="48" cy="48" r="7" fill="#252c36" stroke="#6f7c8e" stroke-width="2"/></svg>',
      {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
