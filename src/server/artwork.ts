import sharp from 'sharp';

export async function validateArtwork(bytes: Uint8Array) {
  if (
    bytes.length > 500000 ||
    Buffer.from(bytes).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  )
    throw new Error('Invalid PNG content');
  const decoder = sharp(bytes, {
    limitInputPixels: 1024 * 1024,
    failOn: 'warning',
  });
  const m = await decoder.metadata();
  if (
    m.format !== 'png' ||
    !m.width ||
    !m.height ||
    m.width > 1024 ||
    m.height > 1024
  )
    throw new Error('Invalid PNG dimensions');
  await decoder.raw().toBuffer();
  return { width: m.width, height: m.height, transparent: !!m.hasAlpha };
}
