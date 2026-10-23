import { promises as dns } from "node:dns";
import { BlockList, isIP } from "node:net";

/**
 * SSRF guard for merchant-supplied endpoints (EC-I4). A webhook URL is accepted only when it is
 * https, carries no credentials, names a public host, and every address that host resolves to is
 * public too; the job repeats the check at send time so a record rebound to 10.0.0.1 between
 * "save" and "deliver" is refused as well. http is allowed for localhost outside production, so a
 * receiver on the developer's machine can be tried.
 */

export class PublicUrlError extends Error {
  readonly code = "unsafe_url";
  constructor(message: string) {
    super(message);
    this.name = "PublicUrlError";
  }
}

export type AddressResolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export interface PublicUrlOptions {
  /** Injected in tests; defaults to `dns.promises.lookup(host, { all: true })`. */
  resolve?: AddressResolver;
  /** Defaults to NODE_ENV !== "production". */
  allowLocalhost?: boolean;
}

const privateRanges = new BlockList();
// IPv4: "this" network, loopback, private, CGNAT, link-local and the cloud metadata address, IETF
// protocol assignments, benchmarking, multicast, reserved and broadcast.
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  privateRanges.addSubnet(net, prefix, "ipv4");
}
// IPv6: unspecified, loopback, NAT64 (hides an IPv4 we cannot see), unique local, link-local,
// deprecated site-local and multicast. IPv4-mapped addresses are checked by BlockList as IPv4.
privateRanges.addAddress("::", "ipv6");
privateRanges.addAddress("::1", "ipv6");
privateRanges.addSubnet("64:ff9b::", 96, "ipv6");
privateRanges.addSubnet("fc00::", 7, "ipv6");
privateRanges.addSubnet("fe80::", 10, "ipv6");
privateRanges.addSubnet("fec0::", 10, "ipv6");
privateRanges.addSubnet("ff00::", 8, "ipv6");

const LOCAL_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

export function isPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !privateRanges.check(address, family === 6 ? "ipv6" : "ipv4");
}

function isLocalhostName(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

const defaultResolve: AddressResolver = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

/** Returns the parsed URL when it is safe to call; throws `PublicUrlError` with a merchant-readable reason otherwise. */
export async function assertPublicHttpUrl(raw: string, opts: PublicUrlOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new PublicUrlError("Enter a full URL, for example https://example.com/webhooks/catalogforge");
  }
  const allowLocalhost = opts.allowLocalhost ?? process.env.NODE_ENV !== "production";
  const hostname = url.hostname.toLowerCase();
  const localhost = isLocalhostName(hostname);

  if (url.protocol !== "https:" && !(url.protocol === "http:" && allowLocalhost && localhost)) {
    throw new PublicUrlError(url.protocol === "http:" ? "Webhook URLs must use https (http is only allowed for localhost while developing)" : "Webhook URLs must use https");
  }
  if (url.username || url.password) throw new PublicUrlError("Webhook URLs must not contain a username or password");
  if (!hostname) throw new PublicUrlError("Webhook URLs need a host name");
  if (localhost && allowLocalhost) return url;

  if (hostname === "localhost" || LOCAL_HOST_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new PublicUrlError(`${hostname} is a local name; webhooks can only call public hosts`);
  }
  const literal = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (isIP(literal)) {
    if (!isPublicIp(literal)) throw new PublicUrlError(`${literal} is a private or internal address; webhooks can only call public hosts`);
    return url;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await (opts.resolve ?? defaultResolve)(hostname);
  } catch {
    throw new PublicUrlError(`${hostname} could not be resolved; check the host name`);
  }
  if (addresses.length === 0) throw new PublicUrlError(`${hostname} could not be resolved; check the host name`);
  const unsafe = addresses.find((a) => !isPublicIp(a.address));
  if (unsafe) throw new PublicUrlError(`${hostname} resolves to ${unsafe.address}, a private or internal address; webhooks can only call public hosts`);
  return url;
}
