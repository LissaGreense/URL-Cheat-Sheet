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
 * Resolve `host` via the OS resolver, assert every returned IP is public,
 * and return the pinned address. Closes the DNS-rebinding TOCTOU window
 * by handing the pinned IP back for `fetch()` to connect to directly.
 */
export async function resolveAndPin(host: string): Promise<string> {
  if (isIP(host)) {
    assertPublicIp(host);
    return host;
  }
  const all = await lookup(host, { all: true });
  if (!all.length) {
    throw new SsrfBlockedError(host, 'no-dns');
  }
  for (const { address } of all) assertPublicIp(address);
  return all[0]!.address;
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
