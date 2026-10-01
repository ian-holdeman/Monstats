import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-z0-9]+$/.test(id)) return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(
      resolve(
        process.env.MONSTATS_DATA_DIR ?? '.monstats',
        'sprites',
        `${id}.png`,
      ),
    );
    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
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
