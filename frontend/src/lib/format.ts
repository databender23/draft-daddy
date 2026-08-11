export const EM_DASH = '—';

export function fmtNum(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return value.toFixed(digits);
}

export function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return String(Math.round(value));
}

export function fmtSigned(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  const text = Math.abs(value).toFixed(digits);
  if (value > 0) return `+${text}`;
  if (value < 0) return `-${text}`;
  return text;
}

export function tierClass(tier: number | null | undefined): string {
  if (tier === null || tier === undefined || tier < 1) return 'tier tier-x';
  if (tier > 8) return 'tier tier-x';
  return `tier tier-${tier}`;
}

export function timeAgo(ts: number | null, now: number = Date.now()): string {
  if (ts === null) return 'never';
  const secs = Math.max(0, Math.round((now - ts) / 1000));
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}
