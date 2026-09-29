import { networkInterfaces } from "node:os";

function isIPv4(family: string | unknown): family is "IPv4" {
  return family === "IPv4";
}

function isPrivate(addr: string): boolean {
  return (
    addr.startsWith("10.") ||
    addr.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(addr)
  );
}

export function getLanIPv4(): string {
  const all: { addr: string; private: boolean }[] = [];
  for (const list of Object.values(networkInterfaces())) {
    if (!list) continue;
    for (const ni of list) {
      if (!isIPv4(ni.family)) continue;
      if (ni.internal) continue;
      all.push({ addr: ni.address, private: isPrivate(ni.address) });
    }
  }
  if (all.length === 0) return "127.0.0.1";
  all.sort((a, b) => Number(b.private) - Number(a.private));
  const chosen = all[0]!;
  return chosen.addr;
}
