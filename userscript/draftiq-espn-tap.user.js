// ==UserScript==
// @name         Draft Daddy — ESPN Draft Tap
// @namespace    https://draftiq.databender.co
// @version      0.2.0
// @description  Relays live ESPN draft-room picks to your Draft Daddy board (read-only; never drafts for you).
// @match        https://fantasy.espn.com/football/draft*
// @match        https://lm.fantasy.espn.com/football/draft*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * ESPN's draft room talks to wss://fantasydraft.espn.com over a plain-text
 * protocol (SELECTED/SOLD frames, plus a base64 INIT snapshot on connect).
 * This script wraps window.WebSocket before the room connects, listens to
 * those frames on the page's own authenticated socket, and POSTs picks to
 * the Draft Daddy backend (/api/draft/events). It never sends anything to ESPN.
 *
 * Setup: click the "IQ" badge (bottom-right of the draft room) and paste the
 * tap key shown in Draft Daddy's Settings. For mock-lobby practice, override the
 * league/season to your board's league so picks land in the right bucket.
 */

(function () {
  'use strict';

  var CONFIG_KEY = 'draftiq:tap:config';
  var FLUSH_MS = 1200;
  var DEFAULT_ENDPOINT = 'https://draftiq.databender.co';

  var urlParams = new URLSearchParams(window.location.search);
  var roomLeagueId = urlParams.get('leagueId') || '';
  var roomSeason = urlParams.get('seasonId') || '';

  var config = loadConfig();
  var pending = [];
  var sentIds = {};
  var queuedIds = {};
  var relayedCount = 0;
  var lastError = null;
  var badge = null;

  function loadConfig() {
    try {
      var raw = window.localStorage.getItem(CONFIG_KEY);
      var cfg = raw ? JSON.parse(raw) : {};
      return {
        endpoint: cfg.endpoint || DEFAULT_ENDPOINT,
        key: cfg.key || '',
        leagueId: cfg.leagueId || '',
        season: cfg.season || '',
      };
    } catch (e) {
      return { endpoint: DEFAULT_ENDPOINT, key: '', leagueId: '', season: '' };
    }
  }

  function saveConfig() {
    try {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      /* storage unavailable */
    }
  }

  function targetLeague() {
    return String(config.leagueId || roomLeagueId || '').trim();
  }

  function targetSeason() {
    var season = parseInt(config.season || roomSeason, 10);
    return isNaN(season) ? new Date().getFullYear() : season;
  }

  function ready() {
    return Boolean(config.key && targetLeague());
  }

  // ---- pick queue -----------------------------------------------------------

  function queuePick(pick) {
    // Placeholder slots are -1/0; D/ST units are negative (-16001…) and real.
    if (!pick || pick.espn_id === 0 || pick.espn_id === -1 || isNaN(pick.espn_id)) return;
    if (sentIds[pick.espn_id] || queuedIds[pick.espn_id]) return;
    queuedIds[pick.espn_id] = true;
    pending.push(pick);
  }

  function flush() {
    if (!pending.length || !ready()) return;
    var batch = pending;
    pending = [];
    fetch(config.endpoint.replace(/\/+$/, '') + '/api/draft/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        league_id: targetLeague(),
        season: targetSeason(),
        key: config.key,
        source: 'tap',
        picks: batch,
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        for (var i = 0; i < batch.length; i++) {
          sentIds[batch[i].espn_id] = true;
          delete queuedIds[batch[i].espn_id];
        }
        relayedCount += batch.length;
        lastError = null;
        renderBadge();
      })
      .catch(function (err) {
        // Re-queue and retry on the next tick; the backend dedupes by espn_id.
        pending = batch.concat(pending);
        lastError = String((err && err.message) || err);
        renderBadge();
      });
  }

  window.setInterval(flush, FLUSH_MS);

  // ---- frame parsing --------------------------------------------------------

  function handleFrame(text) {
    var parts = text.split(' ');
    var verb = parts[0];
    if (verb === 'SELECTED' && parts.length >= 3) {
      // SELECTED {teamId} {playerId} {overallPick} {memberId}
      queuePick({
        espn_id: parseInt(parts[2], 10),
        overall: parts.length > 3 ? safeInt(parts[3]) : null,
        espn_team_id: safeInt(parts[1]),
        member_id: parts.length > 4 ? parts[4] : null,
      });
    } else if (verb === 'SOLD' && parts.length >= 3) {
      // Auction: SOLD {teamId} {playerId} {…} {price} {…} — no overall pick no.
      queuePick({
        espn_id: parseInt(parts[2], 10),
        overall: null,
        espn_team_id: safeInt(parts[1]),
        member_id: null,
      });
    } else if (verb === 'INIT' && parts.length >= 2) {
      try {
        parseInitBlob(parts.slice(1).join(' '));
      } catch (e) {
        /* snapshot decode is best-effort; live frames still flow */
      }
    }
  }

  function safeInt(value) {
    var n = parseInt(value, 10);
    return isNaN(n) ? null : n;
  }

  // INIT carries a base64 room snapshot: the pick ledger is the longest run of
  // consecutive 45-byte big-endian records starting with the room's league id
  // (u32 leagueId | u32 teamId | u32 pickNumber | i32 playerId | …). Completed
  // picks have a real playerId; pending slots are -1. Blobs can contain
  // interleaved non-base64 characters — strip them before decoding.
  function parseInitBlob(blob) {
    var leagueNum = parseInt(roomLeagueId, 10);
    if (!leagueNum) return;
    var clean = blob.replace(/[^A-Za-z0-9+/=]/g, '');
    var binary = window.atob(clean);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var view = new DataView(bytes.buffer);
    var RECORD = 45;

    var bestStart = -1;
    var bestCount = 0;
    var offset = 0;
    while (offset + RECORD <= bytes.length) {
      if (view.getUint32(offset) === leagueNum) {
        var count = 0;
        while (
          offset + (count + 1) * RECORD <= bytes.length &&
          view.getUint32(offset + count * RECORD) === leagueNum
        ) {
          count++;
        }
        if (count > bestCount) {
          bestCount = count;
          bestStart = offset;
        }
        offset += count * RECORD;
      } else {
        offset++;
      }
    }

    for (var r = 0; r < bestCount; r++) {
      var base = bestStart + r * RECORD;
      var playerId = view.getInt32(base + 12);
      if (playerId === -1 || playerId === 0) continue;
      queuePick({
        espn_id: playerId,
        overall: view.getUint32(base + 8) || null,
        espn_team_id: view.getUint32(base + 4),
        member_id: null,
      });
    }
  }

  // ---- WebSocket wrap (must run before the room connects) -------------------

  var NativeWS = window.WebSocket;

  function TappedWebSocket(url, protocols) {
    var ws = protocols === undefined ? new NativeWS(url) : new NativeWS(url, protocols);
    try {
      if (String(url).indexOf('fantasydraft.espn.com') !== -1) {
        ws.addEventListener('message', function (ev) {
          if (typeof ev.data === 'string') {
            try {
              handleFrame(ev.data);
            } catch (e) {
              /* never break the draft room */
            }
          }
        });
      }
    } catch (e) {
      /* instrumentation is best-effort */
    }
    return ws;
  }

  TappedWebSocket.prototype = NativeWS.prototype;
  TappedWebSocket.CONNECTING = NativeWS.CONNECTING;
  TappedWebSocket.OPEN = NativeWS.OPEN;
  TappedWebSocket.CLOSING = NativeWS.CLOSING;
  TappedWebSocket.CLOSED = NativeWS.CLOSED;
  window.WebSocket = TappedWebSocket;

  // ---- status badge ---------------------------------------------------------

  function renderBadge() {
    if (!badge) return;
    if (!ready()) {
      badge.textContent = 'DD · set up';
      badge.style.background = '#B45309';
    } else if (lastError) {
      badge.textContent = 'DD · retry (' + relayedCount + ')';
      badge.style.background = '#B91C1C';
      badge.title = 'Draft Daddy tap — last error: ' + lastError;
    } else {
      badge.textContent = 'DD · ' + relayedCount;
      badge.style.background = '#1A9988';
      badge.title =
        'Draft Daddy tap — ' + relayedCount + ' picks relayed to league ' + targetLeague();
    }
  }

  function configure() {
    var endpoint = window.prompt('Draft Daddy server:', config.endpoint || DEFAULT_ENDPOINT);
    if (endpoint === null) return;
    var key = window.prompt(
      'Tap key (shown in Draft Daddy → Settings → Live draft tap):',
      config.key,
    );
    if (key === null) return;
    var league = window.prompt(
      'Board league ID (leave as-is unless this is a mock draft):',
      config.leagueId || roomLeagueId,
    );
    if (league === null) return;
    var season = window.prompt('Season:', String(config.season || roomSeason || ''));
    if (season === null) return;
    config = {
      endpoint: (endpoint || DEFAULT_ENDPOINT).trim(),
      key: key.trim(),
      leagueId: league.trim(),
      season: season.trim(),
    };
    saveConfig();
    renderBadge();
  }

  function mountBadge() {
    badge = document.createElement('div');
    badge.style.cssText =
      'position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:6px 10px;' +
      'border-radius:999px;font:600 12px/1 -apple-system,Segoe UI,Roboto,sans-serif;' +
      'color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);user-select:none;';
    badge.title = 'Draft Daddy tap — click to configure';
    badge.addEventListener('click', configure);
    document.body.appendChild(badge);
    renderBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBadge);
  } else {
    mountBadge();
  }
})();
