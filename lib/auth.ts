import crypto from 'crypto';
import { siteConfig } from '@/site.config';

export const COOKIE_NAME = `${siteConfig.id}_edit`;

// The edit-session cookie holds an HMAC that only the server can produce.
// The password itself is never sent to the browser and never stored in a cookie.
function sessionToken(): string {
  const secret = process.env.AUTH_SECRET || process.env.EDIT_PASSWORD || 'dev-secret';
  return crypto.createHmac('sha256', secret).update('editor-v1').digest('hex');
}

export function checkPassword(pw: string): boolean {
  const expected = process.env.EDIT_PASSWORD || '';
  if (!expected) return false;
  // Constant-time compare to avoid timing leaks.
  const a = Buffer.from(String(pw));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function issueToken(): string {
  return sessionToken();
}

export function isValidToken(value: string | undefined): boolean {
  if (!value) return false;
  const expected = sessionToken();
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
