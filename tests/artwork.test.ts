import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from '../src/app/sprites/[id]/route';
import { artworkSource, spriteUrl } from '../src/domain/artwork';
import { validateArtwork } from '../src/server/artwork';
import sharp from 'sharp';

test('reviewed Mega sources keep Raichu X/Y and Z forms separate, decode actual pixels and bypass prior URLs', async () => {
  const forms = [
    'raichumegax',
    'raichumegay',
    'scraftymega',
    'absolmegaz',
    'garchompmegaz',
    'lucariomegaz',
  ];
  assert.equal(
    new Set(forms.map((id) => artworkSource(id)?.url)).size,
    forms.length,
  );
  for (const id of forms) assert.match(spriteUrl(id), /\?v=/);
  const png = await sharp({
    create: {
      width: 96,
      height: 96,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  assert.deepEqual(await validateArtwork(png), {
    width: 96,
    height: 96,
    transparent: true,
  });
  await assert.rejects(validateArtwork(png.subarray(0, 40)));
  await assert.rejects(validateArtwork(Buffer.from('<svg/>')));
});

test('broken local images use a noncached fallback instead of masquerading as covered artwork', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'monstats-artwork-'));
  const previous = process.env.MONSTATS_DATA_DIR;
  try {
    process.env.MONSTATS_DATA_DIR = dir;
    await mkdir(join(dir, 'sprites'));
    await writeFile(
      join(dir, 'sprites', 'raichumegax.png'),
      Buffer.from('89504e470d0a1a0a00000000', 'hex'),
    );
    const response = await GET(
      new Request('http://localhost/sprites/raichumegax'),
      { params: Promise.resolve({ id: 'raichumegax' }) },
    );
    assert.equal(response.headers.get('Content-Type'), 'image/svg+xml');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  } finally {
    if (previous === undefined) delete process.env.MONSTATS_DATA_DIR;
    else process.env.MONSTATS_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
