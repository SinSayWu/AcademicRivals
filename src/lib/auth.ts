import crypto from "node:crypto";
import { cookies } from "next/headers";
import { queryOne } from "./db";

/**
 * Deliberately minimal auth for a group of friends who already know each other.
 *
 *   1. One shared GROUP_CODE gates the whole site. That's the real door.
 *   2. Inside, you pick your name and set a PIN the first time you log in.
 *      The PIN only stops your rivals from logging hours as you.
 *
 * No email, no OAuth, no password reset flow to babysit. If someone forgets
 * their PIN, you clear it with one SQL statement (see README).
 */

const COOKIE = "ar_session";
const SESSION_DAYS = 90;

export type Session = { userId: number; name: string; handle: string };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET must be set to a random string of 16+ chars.");
  }
  return s;
}

export function groupCodeMatches(input: string): boolean {
  const expected = process.env.GROUP_CODE;
  if (!expected) throw new Error("GROUP_CODE is not set.");
  return timingSafeEqual(input.trim(), expected);
}

// ---------------------------------------------------------------- PIN hashing

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(pin, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
  );
}

// ------------------------------------------------------------------- Sessions

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function serialize(userId: number): string {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = `${userId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

function deserialize(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawId, rawExp, sig] = parts;
  if (!timingSafeEqual(sig, sign(`${rawId}.${rawExp}`))) return null;
  if (Number(rawExp) < Date.now()) return null;
  const id = Number(rawId);
  return Number.isInteger(id) ? id : null;
}

export async function startSession(userId: number): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, serialize(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Verifies the row still exists. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const userId = deserialize(token);
  if (userId === null) return null;

  return queryOne<Session>(
    `SELECT id AS "userId", name, handle FROM users WHERE id = $1`,
    [userId],
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
