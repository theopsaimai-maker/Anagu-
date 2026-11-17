const ENV_API_BASE = (
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || ''
).replace(/\/+$/, '');

let resolvedApiBaseCache: string | null = ENV_API_BASE ? ENV_API_BASE : null;

export function getCandidateApiBases(): string[] {
  const candidates: string[] = [];
  if (ENV_API_BASE) {
    candidates.push(ENV_API_BASE);
  }
  candidates.push('');

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    const lowerHost = hostname.toLowerCase();

    // Support split admin domains like anagu-psi.admin.vercel.app or anagu-admin.vercel.app
    if (lowerHost.startsWith('admin.')) {
      candidates.push(`${protocol}//${hostname.slice('admin.'.length)}`);
    } else if (lowerHost.includes('.admin.')) {
      candidates.push(`${protocol}//${hostname.replace(/\.admin\./i, '.')}`);
    } else if (lowerHost.includes('-admin.')) {
      candidates.push(`${protocol}//${hostname.replace(/-admin\./i, '.')}`);
    }
  }

  return Array.from(new Set(candidates));
}

export function setResolvedApiBase(base: string): void {
  resolvedApiBaseCache = base.replace(/\/+$/, '');
}

export function getResolvedApiBase(): string {
  if (resolvedApiBaseCache !== null) return resolvedApiBaseCache;
  if (ENV_API_BASE) return ENV_API_BASE;
  return '';
}

export function buildApiUrl(path: string, baseOverride?: string): string {
  const base = (baseOverride ?? getResolvedApiBase()).replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}
