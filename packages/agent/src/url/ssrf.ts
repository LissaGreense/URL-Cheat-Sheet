import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

/**
 * Throw if `addr` is not a public unicast IP. Collapses IPv4-mapped IPv6
 * (`::ffff:127.0.0.1`) before classifying.
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
 * Resolve `host` via the OS resolver and assert every returned IP is
 * public. The caller passes the original URL to `fetch` (not a pinned IP)
 * — see `safeFetch` for why that shape is the only Bun+Node-portable one.
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
