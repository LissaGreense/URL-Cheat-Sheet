import { describe, it, expect } from 'vitest';
import rfcText from '../src/data/rfc2324.txt?raw';

describe('bundled RFC 2324', () => {
  it('is non-empty plaintext containing HTCPCP', () => {
    expect(typeof rfcText).toBe('string');
    expect(rfcText.length).toBeGreaterThan(1000);
    expect(rfcText).toContain('HTCPCP');
  });

  it('preserves line breaks for line-numbered grep', () => {
    const lines = rfcText.split('\n');
    expect(lines.length).toBeGreaterThan(100);
  });
});
