import { randomBytes } from "node:crypto";

const token = randomBytes(24).toString("base64url");

export function getAdminToken(): string {
  return token;
}

export function verifyAdminToken(candidate?: string): boolean {
  if (!candidate || typeof candidate !== "string") return false;
  return candidate.trim() === token;
}
