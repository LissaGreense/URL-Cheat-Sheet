import { describe, it, expect } from 'vitest';
import { assertPublicIp } from '../src/url/ssrf';

describe('assertPublicIp', () => {
  it('accepts public IPv4', () => {
    expect(() => assertPublicIp('8.8.8.8')).not.toThrow();
    expect(() => assertPublicIp('1.1.1.1')).not.toThrow();
  });

  it('rejects loopback', () => {
    expect(() => assertPublicIp('127.0.0.1')).toThrow();
    expect(() => assertPublicIp('127.1.2.3')).toThrow();
  });

  it('rejects RFC 1918 private', () => {
    expect(() => assertPublicIp('10.0.0.1')).toThrow();
    expect(() => assertPublicIp('172.16.0.1')).toThrow();
    expect(() => assertPublicIp('192.168.1.1')).toThrow();
  });

  it('rejects link-local (cloud metadata endpoint)', () => {
    expect(() => assertPublicIp('169.254.169.254')).toThrow();
  });

  it('rejects 0.0.0.0', () => {
    expect(() => assertPublicIp('0.0.0.0')).toThrow();
  });

  it('rejects IPv6 loopback', () => {
    expect(() => assertPublicIp('::1')).toThrow();
  });

  it('rejects IPv6 link-local fe80::', () => {
    expect(() => assertPublicIp('fe80::1')).toThrow();
  });

  it('rejects IPv6 unique-local fc00::/7', () => {
    expect(() => assertPublicIp('fc00::1')).toThrow();
    expect(() => assertPublicIp('fd12:3456:789a:1::1')).toThrow();
  });

  it('rejects IPv4-mapped IPv6 loopback ::ffff:127.0.0.1', () => {
    expect(() => assertPublicIp('::ffff:127.0.0.1')).toThrow();
  });

  it('accepts public IPv6', () => {
    expect(() => assertPublicIp('2001:4860:4860::8888')).not.toThrow();
  });
});

describe('WHATWG URL normalizes numeric-IP obfuscation', () => {
  // Documents the invariant our SSRF guard relies on. WHATWG URL does the
  // normalization; we don't need a custom IP parser.
  it('octal → 127.0.0.1', () => {
    expect(new URL('http://0177.0.0.1/').hostname).toBe('127.0.0.1');
  });

  it('integer → 127.0.0.1', () => {
    expect(new URL('http://2130706433/').hostname).toBe('127.0.0.1');
  });

  it('hex → 127.0.0.1', () => {
    expect(new URL('http://0x7f000001/').hostname).toBe('127.0.0.1');
  });

  it('shorthand 127.1 → 127.0.0.1', () => {
    expect(new URL('http://127.1/').hostname).toBe('127.0.0.1');
  });
});
