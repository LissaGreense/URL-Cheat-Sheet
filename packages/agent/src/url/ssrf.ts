import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

/**
 * Throw if `addr` is not a public unicast IP. Handles IPv4, IPv6, and
 * IPv4-mapped IPv6 (::ffff:127.0.0.1) by collapsing the mapping before
 * classifying.
 *
 * See docs/specs/2026-05-19-url-fetcher.md § Fetcher hardening.
 */
export function assertPublicIp(addr: string): void {
  let ip = ipaddr.parse(addr);
  if (ip instanceof ipaddr.IPv6 && ip.isIPv4MappedAddress()) {
    ip = ip.toIPv4Address();
  }
  const range = ip.range();
  if (range !== 'unicast') {
    throw new SsrfBlockedError(addr, range);
  }
}

/**
 * Resolve `host` via the OS resolver and assert every returned IP is public.
 * Returns void — the caller passes the original URL to `fetch`, which redoes
 * its own DNS lookup at connect time. A small TOCTOU rebinding window exists
 * between this check and `fetch`'s resolution; mitigated by short DNS TTLs
 * and by running in environments with no VPC routes to internal services.
 *
 * This shape is portable across Bun and Node/undici — earlier versions
 * pinned the IP into the URL and forwarded the original host via the `Host`
 * header, but Node/undici drives SNI from the URL hostname, which breaks
 * the TLS handshake against any origin that requires correct SNI.
 */
export async function validateHostIsPublic(host: string): Promise<void> {
  if (isIP(host)) {
    assertPublicIp(host);
    return;
  }
  const all = await lookup(host, { all: true });
  if (!all.length) {
    throw new SsrfBlockedError(host, 'no-dns');
  }
  for (const { address } of all) assertPublicIp(address);
}

export class SsrfBlockedError extends Error {
  constructor(
    public readonly addr: string,
    public readonly range: string
  ) {
    super(`SSRF: ${addr} is ${range}`);
    this.name = 'SsrfBlockedError';
  }
}
