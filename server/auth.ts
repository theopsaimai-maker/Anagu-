import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AccessRoleId, AdminUser } from '../src/types/anagu.ts';

export const MIN_PRODUCTION_SECRET_LENGTH = 32;
export const MIN_ADMIN_INVITE_LENGTH = 16;
export const DEFAULT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const VALID_USER_ROLES: ReadonlySet<AccessRoleId> = new Set(['citizen', 'surveyor', 'oracle']);

const globalAuthStore = globalThis as unknown as {
  _anaguRuntimeHmacSecret?: string;
  _anaguRuntimeSecretSource?: string;
};

export interface VerifiedAdminSession {
  scope: 'admin';
  sub: string;
  email: string;
  fullName: string;
  exp: number;
}

export interface VerifiedUserSession {
  scope: 'user';
  sub: string;
  email: string;
  role: AccessRoleId;
  exp: number;
}

export function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isDemoAccountsEnabled(): boolean {
  return !isProductionEnv() && process.env.ALLOW_DEMO_ACCOUNTS === 'true';
}

export function resetSigningSecretCache(): void {
  globalAuthStore._anaguRuntimeHmacSecret = undefined;
  globalAuthStore._anaguRuntimeSecretSource = undefined;
}

/**
 * Resolves the HMAC token signing key.
 * - Never falls back to SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, or DATABASE_URL.
 * - In production (NODE_ENV=production), requires AUTH_TOKEN_SECRET (or ADMIN_TOKEN_SECRET)
 *   with at least 32 characters and fails fast with a clear configuration error if absent.
 * - In non-production dev/test, uses configured AUTH_TOKEN_SECRET / ADMIN_TOKEN_SECRET if set,
 *   or persists a stable random 256-bit key in `.anagu-data/.hmac-secret` (or ANAGU_DATA_DIR).
 */
export function getSigningSecret(): string {
  const configured =
    process.env.AUTH_TOKEN_SECRET?.trim() || process.env.ADMIN_TOKEN_SECRET?.trim() || '';

  if (isProductionEnv()) {
    if (configured.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `[anagu/auth] Configuration error: AUTH_TOKEN_SECRET (or ADMIN_TOKEN_SECRET) must be set to a cryptographically strong value of at least ${MIN_PRODUCTION_SECRET_LENGTH} characters when NODE_ENV=production. Refusing to fall back to SUPABASE_SECRET_KEY or an ephemeral secret.`
      );
    }
    const cacheKey = `prod:${configured}`;
    if (
      globalAuthStore._anaguRuntimeHmacSecret &&
      globalAuthStore._anaguRuntimeSecretSource === cacheKey
    ) {
      return globalAuthStore._anaguRuntimeHmacSecret;
    }
    const derived = crypto
      .createHash('sha256')
      .update(`anagu:hmac:v2:${configured}`)
      .digest('hex');
    globalAuthStore._anaguRuntimeHmacSecret = derived;
    globalAuthStore._anaguRuntimeSecretSource = cacheKey;
    return derived;
  }

  if (configured) {
    const cacheKey = `env:${configured}`;
    if (
      globalAuthStore._anaguRuntimeHmacSecret &&
      globalAuthStore._anaguRuntimeSecretSource === cacheKey
    ) {
      return globalAuthStore._anaguRuntimeHmacSecret;
    }
    const derived = crypto
      .createHash('sha256')
      .update(`anagu:hmac:v2:${configured}`)
      .digest('hex');
    globalAuthStore._anaguRuntimeHmacSecret = derived;
    globalAuthStore._anaguRuntimeSecretSource = cacheKey;
    return derived;
  }

  if (
    globalAuthStore._anaguRuntimeHmacSecret &&
    globalAuthStore._anaguRuntimeSecretSource === 'dev-file'
  ) {
    return globalAuthStore._anaguRuntimeHmacSecret;
  }

  const customDir = process.env.ANAGU_DATA_DIR?.trim();
  const secretDirs = [
    ...(customDir ? [customDir] : []),
    path.join(process.cwd(), '.anagu-data'),
    '/tmp'
  ];

  for (const dir of secretDirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const secretFile = path.join(dir, '.hmac-secret');
      if (fs.existsSync(secretFile)) {
        const existing = fs.readFileSync(secretFile, 'utf8').trim();
        if (/^[a-f0-9]{64}$/i.test(existing)) {
          globalAuthStore._anaguRuntimeHmacSecret = existing;
          globalAuthStore._anaguRuntimeSecretSource = 'dev-file';
          return existing;
        }
      }
      const generated = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
      globalAuthStore._anaguRuntimeHmacSecret = generated;
      globalAuthStore._anaguRuntimeSecretSource = 'dev-file';
      return generated;
    } catch {
      // Try next writable directory in dev/test only
    }
  }

  throw new Error(
    '[anagu/auth] Unable to initialize development token signing secret. Set AUTH_TOKEN_SECRET in your environment.'
  );
}

/**
 * Validates authentication signing configuration at startup.
 * Throws immediately in production if AUTH_TOKEN_SECRET / ADMIN_TOKEN_SECRET is missing or weak.
 */
export function validateAuthConfig(): void {
  getSigningSecret();
}

export function verifyAdminInviteCode(candidate: unknown): boolean {
  if (typeof candidate !== 'string') return false;
  const trimmedCandidate = candidate.trim();
  const expected = process.env.ADMIN_INVITE_SECRET?.trim() || '';
  if (expected.length < MIN_ADMIN_INVITE_LENGTH || trimmedCandidate.length === 0) {
    return false;
  }
  const candidateDigest = crypto.createHash('sha256').update(trimmedCandidate).digest();
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(candidateDigest, expectedDigest);
}

export function signAdminToken(admin: AdminUser, ttlMs = DEFAULT_TOKEN_TTL_MS): string {
  const payload = {
    scope: 'admin' as const,
    sub: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    department: admin.department,
    state: admin.state,
    exp: Date.now() + ttlMs
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAdminToken(token: string): VerifiedAdminSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    if (!encoded || !sig) return null;
    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      scope?: string;
      sub?: string;
      email?: string;
      fullName?: string;
      exp?: number;
    };
    if (
      payload.scope !== 'admin' ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.email !== 'string' ||
      !payload.email ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      Date.now() > payload.exp
    ) {
      return null;
    }
    return {
      scope: 'admin',
      sub: payload.sub,
      email: payload.email,
      fullName: payload.fullName || payload.email,
      exp: payload.exp
    };
  } catch {
    return null;
  }
}

export function signUserToken(
  user: { id: string; email: string; role: AccessRoleId },
  ttlMs = DEFAULT_TOKEN_TTL_MS
): string {
  const payload = {
    scope: 'user' as const,
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + ttlMs
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyUserToken(token: string): VerifiedUserSession | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    if (!encoded || !sig) return null;
    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      scope?: string;
      sub?: string;
      email?: string;
      role?: AccessRoleId;
      exp?: number;
    };
    if (
      payload.scope !== 'user' ||
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.email !== 'string' ||
      !payload.email ||
      !payload.role ||
      !VALID_USER_ROLES.has(payload.role) ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      Date.now() > payload.exp
    ) {
      return null;
    }
    return {
      scope: 'user',
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      exp: payload.exp
    };
  } catch {
    return null;
  }
}

export function getConfiguredAllowedOrigins(): string[] {
  const raw = (process.env.ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter((item) => item.length > 0 && item !== '*');
}

export function isOriginAllowed(origin: string, reqHost?: string): boolean {
  const normalized = origin.trim().replace(/\/+$/, '');
  if (!normalized || normalized === 'null') return false;

  // Same-origin requests (Origin host matches request Host header)
  if (reqHost) {
    const lowerHost = reqHost.trim().toLowerCase();
    if (
      normalized.toLowerCase() === `https://${lowerHost}` ||
      normalized.toLowerCase() === `http://${lowerHost}`
    ) {
      return true;
    }
  }

  const configured = getConfiguredAllowedOrigins();
  if (configured.some((allowed) => allowed.toLowerCase() === normalized.toLowerCase())) {
    return true;
  }

  // In local development (when ALLOWED_ORIGINS is not explicitly overridden), allow localhost dev server origins
  if (!isProductionEnv() && configured.length === 0) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
      return true;
    }
  }

  return false;
}
