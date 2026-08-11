import { useEffect, useState } from 'react';
import { yahooConfigured } from '../api';
import { parseCookiePaste, parseLeagueUrl } from '../lib/espnPaste';
import { generateTapKey } from '../lib/storage';
import type { EspnTeam, RosterConfig, Settings, SyncOutcome, YahooAuth } from '../types';
import { DEFAULT_ROSTER, PROVIDERS } from '../types';

const ROSTER_FIELDS: { key: keyof RosterConfig; label: string; hint?: string }[] = [
  { key: 'qb', label: 'QB' },
  { key: 'rb', label: 'RB' },
  { key: 'wr', label: 'WR' },
  { key: 'te', label: 'TE' },
  { key: 'flex', label: 'FLEX', hint: 'RB/WR/TE' },
  { key: 'superflex', label: 'SFLEX', hint: 'QB/RB/WR/TE' },
  { key: 'dst', label: 'DST' },
  { key: 'k', label: 'K' },
  { key: 'bench', label: 'Bench' },
];

interface Props {
  open: boolean;
  settings: Settings;
  teams: EspnTeam[];
  espnRoster: RosterConfig | null;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  onTest: (settings: Settings) => Promise<SyncOutcome>;
  onClearManual: () => void;
  manualCount: number;
}

export default function SettingsDrawer({
  open,
  settings,
  teams,
  espnRoster,
  onClose,
  onSave,
  onTest,
  onClearManual,
  manualCount,
}: Props) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [testing, setTesting] = useState(false);
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);
  const [urlText, setUrlText] = useState('');
  const [urlParsed, setUrlParsed] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [yahooReady, setYahooReady] = useState(false);
  const [yahooBusy, setYahooBusy] = useState(false);

  useEffect(() => {
    if (open) void yahooConfigured().then(setYahooReady);
  }, [open]);

  // The OAuth popup posts tokens back to this origin when the user finishes.
  useEffect(() => {
    if (!open) return undefined;
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const payload = event.data as { type?: string; ok?: boolean } & Partial<YahooAuth>;
      if (payload?.type !== 'yahoo-auth') return;
      setYahooBusy(false);
      if (payload.ok && payload.refresh_token) {
        setDraft((prev) => ({ ...prev, yahooRefreshToken: payload.refresh_token as string }));
        setOutcome({ ok: true, message: 'Yahoo connected — now set your league ID below.' });
      } else {
        setOutcome({ ok: false, message: 'Yahoo sign-in failed or was cancelled.' });
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Every board gets a tap key up front so pairing the userscript is copy-paste.
      setDraft(settings.tapKey ? settings : { ...settings, tapKey: generateTapKey() });
      setOutcome(null);
      setUrlText('');
      setUrlParsed(null);
      setKeyCopied(false);
    }
  }, [open, settings]);

  if (!open) return null;

  function patch(next: Partial<Settings>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  function handleUrlPaste(text: string) {
    setUrlText(text);
    const parsed = parseLeagueUrl(text);
    if (!parsed.leagueId) {
      setUrlParsed(text.trim() ? 'No leagueId found in that URL — paste any page of your league.' : null);
      return;
    }
    const next: Partial<Settings> = { leagueId: parsed.leagueId };
    if (parsed.season !== null) next.season = parsed.season;
    if (parsed.teamId !== null) next.myTeamId = parsed.teamId;
    patch(next);
    setUrlParsed(
      `✓ League ${parsed.leagueId}` +
        (parsed.season !== null ? ` · season ${parsed.season}` : '') +
        (parsed.teamId !== null ? ` · your team #${parsed.teamId}` : ''),
    );
  }

  function handleCookiePaste(text: string, field: 'espnS2' | 'swid') {
    const parsed = parseCookiePaste(text);
    if (parsed.espnS2 && parsed.swid) {
      patch({ espnS2: parsed.espnS2, swid: parsed.swid });
    } else if (field === 'espnS2') {
      patch({ espnS2: parsed.espnS2 ?? text });
    } else {
      patch({ swid: parsed.swid ?? text });
    }
  }

  function patchRoster(key: keyof RosterConfig, raw: string) {
    const value = Math.max(0, Math.min(30, Math.round(Number(raw))));
    setDraft((prev) => ({
      ...prev,
      roster: { ...prev.roster, [key]: Number.isFinite(value) ? value : 0 },
    }));
  }

  async function handleTest() {
    setTesting(true);
    onSave(draft);
    const result = await onTest(draft);
    setOutcome(result);
    setTesting(false);
  }

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="drawer">
        <div className="drawer-head">
          <h2>Settings</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="drawer-body">
          <label className="field">
            <span>Platform</span>
            <select
              value={draft.provider}
              onChange={(e) => patch({ provider: e.target.value as Settings['provider'] })}
            >
              {PROVIDERS.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>

          {draft.provider === 'espn' && (
            <>
              <label className="field">
                <span>Quick connect — paste your ESPN league URL</span>
                <input
                  type="text"
                  value={urlText}
                  onChange={(e) => handleUrlPaste(e.target.value)}
                  placeholder="https://fantasy.espn.com/football/team?leagueId=…&teamId=…"
                />
                {urlParsed && (
                  <span className={urlParsed.startsWith('✓') ? 'parse-ok' : 'parse-bad'}>
                    {urlParsed}
                  </span>
                )}
              </label>

              <p className="note">
                Open your league at fantasy.espn.com, copy the address bar, paste it above —
                league, season and your team fill in automatically. Then hit Test connection:
                public leagues connect with nothing else; private leagues will ask for the two
                cookies below.
              </p>
            </>
          )}

          {draft.provider === 'yahoo' && (
            <div className="field">
              <span className="roster-head">
                Yahoo account
                <span className="roster-actions">
                  <button
                    type="button"
                    className="btn tiny"
                    disabled={!yahooReady || yahooBusy}
                    onClick={() => {
                      setYahooBusy(true);
                      window.open('/api/yahoo/login', 'yahoo-auth', 'width=520,height=680');
                    }}
                  >
                    {draft.yahooRefreshToken ? 'Reconnect' : 'Connect Yahoo'}
                  </button>
                  {draft.yahooRefreshToken && (
                    <button
                      type="button"
                      className="btn tiny"
                      onClick={() => patch({ yahooRefreshToken: '' })}
                    >
                      Disconnect
                    </button>
                  )}
                </span>
              </span>
              <p className="note">
                {!yahooReady
                  ? 'Yahoo sync is not configured on this server (needs YAHOO_CLIENT_ID / YAHOO_CLIENT_SECRET).'
                  : draft.yahooRefreshToken
                    ? '✓ Connected. Yahoo publishes picks through its official API during the draft, so no userscript is needed — set your league ID below and turn Live on.'
                    : 'Sign in with Yahoo to let Draft Daddy read your league. The sign-in token stays in this browser, exactly like the ESPN cookies.'}
              </p>
            </div>
          )}

          {draft.provider === 'tap' && (
            <p className="note">
              Tap-only mode drives the board entirely from the draft-room userscript — for any
              platform with no usable API. Set a league ID below (any label works, it just buckets
              your picks), copy the tap key, and configure the userscript in your draft room.
              Manual removal still works as always.
            </p>
          )}

          <label className="field">
            <span>League ID</span>
            <input
              type="text"
              inputMode={draft.provider === 'tap' ? 'text' : 'numeric'}
              value={draft.leagueId}
              onChange={(e) => patch({ leagueId: e.target.value })}
              placeholder={draft.provider === 'tap' ? 'my-league' : '123456789'}
            />
            {draft.provider === 'yahoo' && (
              <span className="parse-ok">
                From your Yahoo league URL: football.fantasysports.yahoo.com/f1/<b>123456</b>
              </span>
            )}
          </label>

          <label className="field">
            <span>Season</span>
            <input
              type="number"
              value={draft.season}
              onChange={(e) => patch({ season: Number(e.target.value) || settings.season })}
            />
          </label>

          {draft.provider === 'espn' && (
          <label className="field">
            <span>espn_s2 (private leagues only)</span>
            <textarea
              rows={3}
              value={draft.espnS2}
              onChange={(e) => handleCookiePaste(e.target.value, 'espnS2')}
              placeholder="AEB…%2F…  — or paste your whole cookie string, both fields fill in"
            />
          </label>
          )}

          {draft.provider === 'espn' && (
          <label className="field">
            <span>SWID (private leagues only)</span>
            <input
              type="text"
              value={draft.swid}
              onChange={(e) => handleCookiePaste(e.target.value, 'swid')}
              placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
            />
          </label>
          )}

          {draft.provider !== 'tap' && (
          <label className="field">
            <span>My team</span>
            <select
              value={draft.myTeamId === null ? '' : String(draft.myTeamId)}
              onChange={(e) => patch({ myTeamId: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">
                {draft.provider === 'yahoo' ? 'Auto-detect from Yahoo' : 'Auto-detect from SWID'}
              </option>
              {draft.myTeamId !== null && !teams.some((team) => team.id === draft.myTeamId) && (
                <option value={draft.myTeamId}>Team {draft.myTeamId} (from URL)</option>
              )}
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          )}

          <label className="toggle field-inline">
            <input
              type="checkbox"
              checked={draft.live}
              onChange={(e) => patch({ live: e.target.checked })}
            />
            <span>
              {draft.provider === 'tap'
                ? 'Check for relayed picks every few seconds while Live is on'
                : `Poll ${draft.provider === 'yahoo' ? 'Yahoo' : 'ESPN'} every 10s while Live is on`}
            </span>
          </label>

          <div className="field">
            <span className="roster-head">
              {draft.provider === 'tap' ? 'Draft-room tap' : 'Live draft tap (beta)'}
              <span className="roster-actions">
                <button
                  type="button"
                  className="btn tiny"
                  onClick={() => {
                    void navigator.clipboard?.writeText(draft.tapKey);
                    setKeyCopied(true);
                  }}
                >
                  {keyCopied ? 'Copied ✓' : 'Copy key'}
                </button>
                <button
                  type="button"
                  className="btn tiny"
                  onClick={() => {
                    patch({ tapKey: generateTapKey() });
                    setKeyCopied(false);
                  }}
                  title="Invalidates the old key — update the userscript config too"
                >
                  New key
                </button>
              </span>
            </span>
            <input type="text" readOnly value={draft.tapKey} onFocus={(e) => e.target.select()} />
            <p className="note">
              {draft.provider === 'yahoo'
                ? 'Optional for Yahoo — its API already reports picks live. Only useful if you also want draft-room-side relaying.'
                : 'Real-time picks straight from the draft room.'}{' '}
              Install the tap userscript (Tampermonkey, then open{' '}
              <code>/tap/draftdaddy-espn-tap.user.js</code> on this server), click the DD badge in
              the draft room, and paste this key. Picks then land here in seconds — with polling
              and manual Remove as fallbacks. Keep the key private: anyone holding it could feed
              this board fake picks.
            </p>
          </div>

          <div className="field">
            <span className="roster-head">
              Roster slots
              <span className="roster-actions">
                {espnRoster && (
                  <button
                    type="button"
                    className="btn tiny"
                    onClick={() => patch({ roster: { ...espnRoster } })}
                    title="Fill from your ESPN league's roster settings (from the last sync)"
                  >
                    Import from ESPN
                  </button>
                )}
                <button
                  type="button"
                  className="btn tiny"
                  onClick={() => patch({ roster: { ...DEFAULT_ROSTER } })}
                >
                  Reset
                </button>
              </span>
            </span>
            <div className="roster-grid">
              {ROSTER_FIELDS.map((field) => (
                <label key={field.key} className="roster-cell" title={field.hint}>
                  <span>{field.label}</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={draft.roster[field.key]}
                    onChange={(e) => patchRoster(field.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
            <p className="note">
              Match your league&rsquo;s lineup (extra QBs, superflex, deeper benches…). Used for the
              roster panel and the &ldquo;position filled&rdquo; hide suggestions.
              {!espnRoster && ' Run a sync or Test connection to enable one-click import from ESPN.'}
            </p>
          </div>

          <p className="note">
            Cookies stay in this browser — they are sent with each sync request and never stored on
            the server. Find them at fantasy.espn.com → DevTools → Application → Cookies →
            <code> espn_s2</code> and <code>SWID</code>.
          </p>

          {outcome && (
            <p className={outcome.ok ? 'result good' : 'result bad'}>{outcome.message}</p>
          )}
        </div>

        <div className="drawer-foot">
          <button type="button" className="btn" onClick={onClearManual} disabled={manualCount === 0}>
            Clear manual picks ({manualCount})
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => void handleTest()} disabled={testing}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
