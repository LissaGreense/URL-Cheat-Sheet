import { describe, it, expect } from 'vitest';
import { GET } from '../src/routes/api/health/+server';

describe('GET /api/health', () => {
  it('responds 200 with ok status and a version', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
  });
});
