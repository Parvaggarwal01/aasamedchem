import "server-only";

import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pbkdf2 } from "node:crypto";
import type { Role, UserSession } from "@/lib/types";

const pbkdf2Async = promisify(pbkdf2);
const cookieName = "aasa_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

type SessionPayload = UserSession & {
  expiresAt: number;
};

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 24) {
    throw new Error("AUTH_SECRET must be configured and at least 24 characters long");
  }

  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

export async function hashPassword(password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const salt = randomBytes(16).toString("hex");
  const hash = (await pbkdf2Async(password, salt, 310000, 32, "sha256")).toString("hex");

  return `pbkdf2_sha256$310000$${salt}$${hash}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, iterationsText, salt, expectedHash] = storedHash.split("$");

  if (scheme !== "pbkdf2_sha256" || !iterationsText || !salt || !expectedHash) {
    return false;
  }

  const hash = (await pbkdf2Async(password, salt, Number(iterationsText), 32, "sha256")).toString("hex");
  const hashBuffer = Buffer.from(hash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (hashBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(hashBuffer, expectedBuffer);
}

export async function createSession(user: UserSession) {
  const payload: SessionPayload = {
    ...user,
    expiresAt: Date.now() + sessionMaxAgeSeconds * 1000,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const token = `${encodedPayload}.${sign(encodedPayload)}`;
  const cookieStore = await cookies();

  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: sessionMaxAgeSeconds,
    path: "/",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function getSession(): Promise<UserSession | null> {
  const token = (await cookies()).get(cookieName)?.value;

  if (!token) {
    return null;
  }

  const [encodedPayload, tokenSignature] = token.split(".");

  if (!encodedPayload || !tokenSignature || sign(encodedPayload) !== tokenSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;

    if (payload.expiresAt < Date.now()) {
      return null;
    }

    return {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

export async function requireRole(role: Role) {
  const session = await requireSession();

  if (session.role !== role) {
    throw new Error("Forbidden");
  }

  return session;
}
