export interface ParsedLeagueUrl {
  leagueId: string | null;
  season: number | null;
  teamId: number | null;
}

/** Pull league/season/team out of any pasted ESPN fantasy URL (or fragment). */
export function parseLeagueUrl(text: string): ParsedLeagueUrl {
  const leagueId = /[?&#]leagueId=(\d+)/i.exec(text)?.[1] ?? null;
  const seasonRaw = /[?&#]seasonId=(\d{4})/i.exec(text)?.[1] ?? null;
  const teamRaw = /[?&#]teamId=(\d+)/i.exec(text)?.[1] ?? null;
  return {
    leagueId,
    season: seasonRaw ? Number(seasonRaw) : null,
    teamId: teamRaw ? Number(teamRaw) : null,
  };
}

export interface ParsedCookies {
  espnS2: string | null;
  swid: string | null;
}

const SWID_RE = /\{?[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}?/i;

/**
 * Accept cookies pasted in any common shape: a raw value, a `document.cookie`
 * dump, `name=value` pairs, or JSON-ish snippets from devtools.
 */
export function parseCookiePaste(text: string): ParsedCookies {
  const trimmed = text.trim();
  let espnS2: string | null = null;
  let swid: string | null = null;

  const s2Labeled = /espn_s2["'\s]*[=:]["'\s]*([^;,"'\s}]+)/i.exec(trimmed);
  if (s2Labeled) espnS2 = s2Labeled[1];

  const swidLabeled = /SWID["'\s]*[=:]["'\s]*(\{?[0-9A-F-]{36}\}?)/i.exec(trimmed);
  const swidMatch = swidLabeled?.[1] ?? SWID_RE.exec(trimmed)?.[0] ?? null;
  if (swidMatch) swid = `{${swidMatch.replace(/[{}]/g, '').toUpperCase()}}`;

  // A bare espn_s2 value: long, no spaces, and not just the SWID itself.
  if (!espnS2 && !/[\s;]/.test(trimmed) && trimmed.length > 80 && !SWID_RE.test(trimmed)) {
    espnS2 = trimmed;
  }

  return { espnS2, swid };
}
