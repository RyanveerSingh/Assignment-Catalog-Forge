import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl, isPublicIp, PublicUrlError, type AddressResolver } from "./public-url";

/** A DNS stand-in: a map from host to answers; unknown hosts fail like NXDOMAIN. */
function resolver(table: Record<string, string[]>): { resolve: AddressResolver; calls: string[] } {
  const calls: string[] = [];
  const resolve: AddressResolver = async (hostname) => {
    calls.push(hostname);
    const answers = table[hostname];
    if (!answers) throw new Error(`ENOTFOUND ${hostname}`);
    return answers.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return { resolve, calls };
}

async function refusal(promise: Promise<unknown>): Promise<PublicUrlError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof PublicUrlError) return err;
    throw err;
  }
  throw new Error("expected the URL to be refused");
}

const PUBLIC = { "hooks.example.com": ["93.184.216.34"], "v6.example.com": ["2606:2800:220:1:248:1893:25c8:1946"], "dual.example.com": ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"] };

describe("assertPublicHttpUrl (EC-I4)", () => {
  it("EC-I4: accepts an https URL whose host resolves only to public addresses", async () => {
    const { resolve, calls } = resolver(PUBLIC);
    const url = await assertPublicHttpUrl("https://hooks.example.com/catalogforge?token=abc", { resolve });
    expect(url.hostname).toBe("hooks.example.com");
    expect(calls).toEqual(["hooks.example.com"]);
    await expect(assertPublicHttpUrl("https://v6.example.com/x", { resolve })).resolves.toBeInstanceOf(URL);
    await expect(assertPublicHttpUrl("https://dual.example.com/x", { resolve })).resolves.toBeInstanceOf(URL);
  });

  it("EC-I4: accepts a public IP literal without a lookup", async () => {
    const { resolve, calls } = resolver({});
    await expect(assertPublicHttpUrl("https://93.184.216.34/hook", { resolve })).resolves.toBeInstanceOf(URL);
    await expect(assertPublicHttpUrl("https://[2606:2800:220:1:248:1893:25c8:1946]/hook", { resolve })).resolves.toBeInstanceOf(URL);
    expect(calls).toEqual([]);
  });

  const privateLiterals: Array<[string, string]> = [
    ["the cloud metadata address", "https://169.254.169.254/latest/meta-data/"],
    ["loopback", "https://127.0.0.1/"],
    ["loopback spelled as a decimal integer", "https://2130706433/"],
    ["loopback spelled in hex", "https://0x7f.0.0.1/"],
    ["loopback spelled short", "https://127.1/"],
    ["10/8", "https://10.0.0.5:8080/hook"],
    ["172.16/12", "https://172.31.255.1/hook"],
    ["192.168/16", "https://192.168.1.1/"],
    ["100.64/10 (CGNAT)", "https://100.127.0.1/"],
    ["0.0.0.0", "https://0.0.0.0/"],
    ["multicast", "https://224.0.0.1/"],
    ["IPv6 loopback", "https://[::1]/"],
    ["IPv6 unspecified", "https://[::]/"],
    ["IPv6 unique local (fc00::/7)", "https://[fd12:3456:789a::1]/"],
    ["IPv6 link-local (fe80::/10)", "https://[fe80::1]/"],
    ["IPv4-mapped loopback", "https://[::ffff:127.0.0.1]/"],
    ["IPv4-mapped private", "https://[::ffff:10.0.0.1]/"],
    ["NAT64 prefix", "https://[64:ff9b::a00:1]/"],
  ];

  it.each(privateLiterals)("EC-I4: refuses %s", async (_name, raw) => {
    const { resolve, calls } = resolver({});
    const err = await refusal(assertPublicHttpUrl(raw, { resolve, allowLocalhost: false }));
    expect(err.code).toBe("unsafe_url");
    expect(err.message).toMatch(/private or internal address/);
    expect(calls).toEqual([]);
  });

  const localNames: Array<[string, string]> = [
    ["localhost in production", "https://localhost/hook"],
    ["a .localhost name", "https://api.localhost/hook"],
    ["a .local name", "https://printer.local/"],
    ["a .internal name", "https://metadata.google.internal/computeMetadata/v1/"],
    ["a .home.arpa name", "https://nas.home.arpa/"],
  ];

  it.each(localNames)("EC-I4: refuses %s without a lookup", async (_name, raw) => {
    const { resolve, calls } = resolver({});
    const err = await refusal(assertPublicHttpUrl(raw, { resolve, allowLocalhost: false }));
    expect(err.message).toMatch(/local name/);
    expect(calls).toEqual([]);
  });

  it("EC-I4: refuses a public-looking host that resolves to a private address (DNS rebinding)", async () => {
    const { resolve } = resolver({ "rebind.example.com": ["10.0.0.1"], "mixed.example.com": ["93.184.216.34", "192.168.0.10"], "v6local.example.com": ["fd00::1"] });
    const a = await refusal(assertPublicHttpUrl("https://rebind.example.com/", { resolve }));
    expect(a.message).toBe("rebind.example.com resolves to 10.0.0.1, a private or internal address; webhooks can only call public hosts");
    const b = await refusal(assertPublicHttpUrl("https://mixed.example.com/", { resolve }));
    expect(b.message).toMatch(/192\.168\.0\.10/);
    const c = await refusal(assertPublicHttpUrl("https://v6local.example.com/", { resolve }));
    expect(c.message).toMatch(/fd00::1/);
  });

  it("EC-I4: a host that does not resolve is refused with a readable message", async () => {
    const { resolve } = resolver({ "empty.example.com": [] });
    expect((await refusal(assertPublicHttpUrl("https://nxdomain.example.com/", { resolve }))).message).toMatch(/could not be resolved/);
    expect((await refusal(assertPublicHttpUrl("https://empty.example.com/", { resolve }))).message).toMatch(/could not be resolved/);
  });

  const malformed: Array<[string, string, RegExp]> = [
    ["plain http to a public host", "http://hooks.example.com/", /must use https/],
    ["ftp", "ftp://hooks.example.com/", /must use https/],
    ["javascript", "javascript:alert(1)", /must use https/],
    ["credentials in the URL", "https://user:pw@hooks.example.com/", /username or password/],
    ["a username only", "https://user@hooks.example.com/", /username or password/],
    ["not a URL at all", "hooks.example.com/path", /full URL/],
    ["empty", "", /full URL/],
  ];

  it.each(malformed)("EC-I4: refuses %s", async (_name, raw, message) => {
    const { resolve, calls } = resolver(PUBLIC);
    const err = await refusal(assertPublicHttpUrl(raw, { resolve }));
    expect(err.message).toMatch(message);
    expect(calls).toEqual([]);
  });

  it("EC-I4: http://localhost is allowed only while developing, never in production", async () => {
    const { resolve, calls } = resolver({});
    await expect(assertPublicHttpUrl("http://localhost:4567/hook", { resolve, allowLocalhost: true })).resolves.toBeInstanceOf(URL);
    await expect(assertPublicHttpUrl("http://127.0.0.1:4567/hook", { resolve, allowLocalhost: true })).resolves.toBeInstanceOf(URL);
    await expect(assertPublicHttpUrl("http://[::1]:4567/hook", { resolve, allowLocalhost: true })).resolves.toBeInstanceOf(URL);
    expect(calls).toEqual([]);
    const err = await refusal(assertPublicHttpUrl("http://localhost:4567/hook", { resolve, allowLocalhost: false }));
    expect(err.message).toMatch(/must use https/);
    // The development exception is for the loopback name only, not for private LAN addresses.
    await refusal(assertPublicHttpUrl("http://192.168.1.20:4567/hook", { resolve, allowLocalhost: true }));
    await refusal(assertPublicHttpUrl("http://hooks.example.com/", { resolve, allowLocalhost: true }));
  });
});

describe("isPublicIp", () => {
  it.each([
    ["93.184.216.34", true],
    ["8.8.8.8", true],
    ["2606:4700::1111", true],
    ["10.1.1.1", false],
    ["172.15.255.255", true],
    ["172.16.0.0", false],
    ["172.31.255.255", false],
    ["172.32.0.0", true],
    ["192.0.0.1", false],
    ["198.18.0.1", false],
    ["255.255.255.255", false],
    ["::ffff:93.184.216.34", true],
    ["::ffff:192.168.1.1", false],
    ["not-an-ip", false],
    ["", false],
  ])("%s → %s", (ip, expected) => {
    expect(isPublicIp(ip)).toBe(expected);
  });
});
