import type { PayloadRequest } from 'payload';
import { headersWithCors } from 'payload';

export const trim = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : null;
};

export const corsHeaders = (req: PayloadRequest, init?: HeadersInit): Headers =>
  headersWithCors({
    headers: new Headers(init),
    req: req as unknown as Request,
  });
