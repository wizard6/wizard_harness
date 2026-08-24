import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.', 'metadata.google.internal']);

export function isPrivateIp(ip: string): boolean {
  const v4 = ip.includes('.') && !ip.includes(':');
  if (v4) {
    const p = ip.split('.').map((n) => Number(n));
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    const a = p[0]!, b = p[1]!;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }
  const low = ip.toLowerCase();
  if (low === '::1' || low === '0:0:0:0:0:0:0:1') return true;
  if (low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80')) return true;
  if (low.startsWith('::ffff:')) return isPrivateIp(low.slice('::ffff:'.length));
  return false;
}

export async function assertPublicHttpUrl(
  raw: string,
  resolveHost: (hostname: string) => Promise<string[]> = defaultLookup,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`非法 URL：${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只允许 http/https');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.localhost')) throw new Error(`拒绝内网地址：${host}`);
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error(`拒绝内网地址：${host}`);
    return url;
  }
  const ips = await resolveHost(host);
  if (!ips.length) throw new Error(`无法解析：${host}`);
  for (const ip of ips) {
    if (isPrivateIp(ip)) throw new Error(`拒绝内网地址：${host} → ${ip}`);
  }
  return url;
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const found = await lookup(hostname, { all: true, verbatim: true });
  return found.map((row) => row.address);
}
