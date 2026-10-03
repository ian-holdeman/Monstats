export class RequestBodyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 408 | 413,
  ) {
    super(message);
  }
}

// Bound the whole upload, including bodies that never send their next chunk.
export async function readRequestBody(
  request: Request,
  maximumBytes = 4096,
  timeoutMs = 10000,
) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestBodyError('Invalid request', 400);
  let complete = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(new RequestBodyError('Request interrupted', 408));
    timer = setTimeout(
      () => reject(new RequestBodyError('Request body timed out', 408)),
      timeoutMs,
    );
    request.signal.addEventListener('abort', abort, { once: true });
  });
  try {
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      if (request.signal.aborted)
        throw new RequestBodyError('Request interrupted', 408);
      const chunk = await Promise.race([reader.read(), interrupted]);
      if (chunk.done) {
        complete = true;
        return Buffer.concat(chunks).toString('utf8');
      }
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes)
        throw new RequestBodyError('Request too large', 413);
      chunks.push(chunk.value);
    }
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
