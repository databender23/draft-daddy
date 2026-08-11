import { useEffect, useMemo, useState } from 'react';
import { ApiError, fetchPlayers } from './api';
import DraftPage from './components/DraftPage';
import HelpPage from './components/HelpPage';
import type { RemovedEntry } from './components/RemovedPanel';
import StrategyPage from './components/StrategyPage';
import Toast from './components/Toast';
import TooltipProvider from './components/TooltipProvider';
import type { ToastState } from './components/Toast';
import type { TeamMap } from './lib/context';
import { byeCountsFor } from './lib/context';
import { suggestPick } from './lib/suggest';
import SettingsDrawer from './components/SettingsDrawer';
import TopBar from './components/TopBar';
import { useBoardKeys } from './hooks/useBoardKeys';
import { useIsMobile } from './hooks/useIsMobile';
import { useDraftSync, hasCreds } from './hooks/useDraftSync';
import type { SortKey } from './lib/board';
import { DEFAULT_SORT, defaultDirFor, matchesSearch, sortPlayers } from './lib/board';
import { hasBucket, loadBucket, loadInitial, saveBucket, savePointer, storageKey } from './lib/storage';
import type {
  AppPage,
  AvgMethod,
  BoardView,
  Player,
  Pos,
  PosFilter,
  Scoring,
  Settings,
} from './types';
import { POSITIONS } from './types';

export default function App() {
  const [initial] = useState(loadInitial);
  const isMobile = useIsMobile();

  const [scoring, setScoring] = useState<Scoring>('PPR');
  const [avg, setAvg] = useState<AvgMethod>('average');
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [manual, setManual] = useState<Set<string>>(() => new Set(initial.manualDrafted));
  const [mine, setMine] = useState<Set<string>>(() => new Set(initial.myPicks));
  const [dismissed, setDismissed] = useState<Pos[]>(initial.dismissed);
  const [removedAt, setRemovedAt] = useState<Record<string, number>>(initial.removedAt);
  const [starred, setStarred] = useState<Set<string>>(() => new Set(initial.starred));

  const [page, setPage] = useState<AppPage>('draft');
  const [view, setView] = useState<BoardView>('board');
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<PosFilter>('ALL');
  const [showDrafted, setShowDrafted] = useState(false);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const sync = useDraftSync({
    settings,
    scoring,
    avg,
    onAuth: (refreshToken) =>
      setSettings((prev) => ({ ...prev, yahooRefreshToken: refreshToken })),
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchPlayers(scoring, avg, controller.signal)
      .then((payload) => {
        setPlayers(payload.players);
        setTeams(payload.teams);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(err instanceof ApiError ? err.message : 'Could not load projections.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scoring, avg]);

  useEffect(() => {
    const key = storageKey(settings.leagueId, settings.season);
    saveBucket(key, {
      settings,
      manualDrafted: [...manual],
      myPicks: [...mine],
      dismissed,
      removedAt,
      starred: [...starred],
    });
    savePointer(settings.leagueId, settings.season);
  }, [settings, manual, mine, dismissed, removedAt, starred]);

  useEffect(() => {
    if (view !== 'removed') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    setNow(Date.now());
    return () => window.clearInterval(timer);
  }, [view]);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const espnDrafted = useMemo(() => {
    const ids = new Set<string>();
    for (const pick of sync.data?.picks ?? []) {
      if (pick.csv_id) ids.add(pick.csv_id);
    }
    return ids;
  }, [sync.data]);

  const draftedIds = useMemo(
    () => new Set<string>([...espnDrafted, ...manual]),
    [espnDrafted, manual],
  );

  const myTeamId = settings.myTeamId ?? sync.data?.my_team_id ?? null;
  const teamName =
    sync.data?.teams.find((team) => team.id === myTeamId)?.name ??
    (myTeamId === null ? null : `Team ${myTeamId}`);

  const myPlayers = useMemo(() => {
    const out: Player[] = [];
    const seen = new Set<string>();
    const picks = [...(sync.data?.picks ?? [])].sort((a, b) => a.overall - b.overall);
    for (const pick of picks) {
      if (myTeamId === null || pick.espn_team_id !== myTeamId || !pick.csv_id) continue;
      const player = byId.get(pick.csv_id);
      if (player && !seen.has(player.id)) {
        seen.add(player.id);
        out.push(player);
      }
    }
    for (const id of mine) {
      const player = byId.get(id);
      if (player && !seen.has(id)) {
        seen.add(id);
        out.push(player);
      }
    }
    return out;
  }, [sync.data, myTeamId, byId, mine]);

  // week -> how many players already on my roster are on bye then; drives the
  // bye-collision warning in the player tooltip.
  const byeCounts = useMemo(() => byeCountsFor(myPlayers, teams), [myPlayers, teams]);

  const livePositions = POSITIONS.filter((pos) => !dismissed.includes(pos));

  const undrafted = useMemo(
    () => players.filter((p) => !dismissed.includes(p.pos) && !draftedIds.has(p.id)),
    [players, dismissed, draftedIds],
  );

  const visible = useMemo(() => {
    const query = search.trim();
    const rows = players.filter((player) => {
      if (dismissed.includes(player.pos)) return false;
      if (posFilter !== 'ALL' && player.pos !== posFilter) return false;
      if (!showDrafted && draftedIds.has(player.id)) return false;
      return matchesSearch(player, query);
    });
    return sortPlayers(rows, sort);
  }, [players, dismissed, posFilter, showDrafted, draftedIds, search, sort]);

  const maxVor = useMemo(
    () => players.reduce((acc, p) => Math.max(acc, p.vor ?? 0), 0),
    [players],
  );

  const suggestion = useMemo(
    () => suggestPick(undrafted, myPlayers, settings.roster),
    [undrafted, myPlayers, settings.roster],
  );

  const watching = useMemo(
    () => players.filter((p) => starred.has(p.id) && !draftedIds.has(p.id)),
    [players, starred, draftedIds],
  );

  useEffect(() => {
    if (cursorIdx !== null && cursorIdx >= visible.length) {
      setCursorIdx(visible.length > 0 ? visible.length - 1 : null);
    }
  }, [cursorIdx, visible.length]);

  const removedEntries = useMemo<RemovedEntry[]>(() => {
    const query = search.trim();
    const entries: RemovedEntry[] = [];
    for (const id of manual) {
      const player = byId.get(id);
      if (!player) continue;
      if (posFilter !== 'ALL' && player.pos !== posFilter) continue;
      if (!matchesSearch(player, query)) continue;
      entries.push({ player, at: removedAt[id] ?? null, isMine: mine.has(id) });
    }
    entries.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    return entries;
  }, [manual, byId, posFilter, search, removedAt, mine]);

  function draftPlayer(player: Player, isMine: boolean) {
    setManual((prev) => new Set(prev).add(player.id));
    if (isMine) setMine((prev) => new Set(prev).add(player.id));
    setRemovedAt((prev) => ({ ...prev, [player.id]: Date.now() }));
    setToast({ player, mine: isMine, key: Date.now() });
    setSearch('');
  }

  function toggleStar(player: Player) {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(player.id)) next.delete(player.id);
      else next.add(player.id);
      return next;
    });
  }

  function undoPlayer(player: Player) {
    setManual((prev) => {
      const next = new Set(prev);
      next.delete(player.id);
      return next;
    });
    setMine((prev) => {
      const next = new Set(prev);
      next.delete(player.id);
      return next;
    });
    setRemovedAt((prev) => {
      const next = { ...prev };
      delete next[player.id];
      return next;
    });
  }

  function notMine(player: Player) {
    setMine((prev) => {
      const next = new Set(prev);
      next.delete(player.id);
      return next;
    });
  }

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultDirFor(key) },
    );
  }

  function applySettings(next: Settings) {
    const currentKey = storageKey(settings.leagueId, settings.season);
    const nextKey = storageKey(next.leagueId, next.season);
    // Switching buckets adopts the target's saved draft state; if the target has
    // never been used, the current picks carry over instead of being dropped.
    if (currentKey !== nextKey && hasBucket(nextKey)) {
      const bucket = loadBucket(nextKey);
      setManual(new Set(bucket.manualDrafted));
      setMine(new Set(bucket.myPicks));
      setDismissed(bucket.dismissed);
      setRemovedAt(bucket.removedAt);
      setStarred(new Set(bucket.starred));
    }
    setSettings(next);
  }

  function dismissPos(pos: Pos) {
    setDismissed((prev) => (prev.includes(pos) ? prev : [...prev, pos]));
    setPosFilter((prev) => (prev === pos ? 'ALL' : prev));
  }

  function restorePos(pos: Pos) {
    setDismissed((prev) => prev.filter((p) => p !== pos));
  }

  useBoardKeys({
    enabled: !settingsOpen && page === 'draft' && view === 'board',
    rows: visible,
    cursorIdx,
    setCursorIdx,
    onDraft: draftPlayer,
    onToggleStar: toggleStar,
  });

  const unmatched = sync.data?.unmatched ?? [];

  return (
    <TooltipProvider teams={teams} byeCounts={byeCounts}>
    <div className="app">
      <TopBar
        page={page}
        onPage={setPage}
        scoring={scoring}
        avg={avg}
        onScoring={setScoring}
        onAvg={setAvg}
        live={settings.live}
        onLive={(value) => applySettings({ ...settings, live: value })}
        credsReady={hasCreds(settings)}
        status={sync.data?.status ?? null}
        tap={sync.data?.tap ?? null}
        lastSync={sync.lastSync}
        syncing={sync.syncing}
        error={sync.error}
        onSyncNow={() => void sync.runSync()}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {page === 'help' && <HelpPage />}
      {page === 'strategy' && <StrategyPage />}

      {page === 'draft' && (
        <DraftPage
          loadError={loadError}
          syncError={sync.error}
          unmatched={unmatched}
          search={search}
          onSearch={setSearch}
          onEnter={() => {
            if (cursorIdx !== null) return;
            if (!search.trim()) return;
            if (view === 'removed') {
              if (removedEntries.length > 0) undoPlayer(removedEntries[0].player);
              return;
            }
            const top = visible.find((player) => !draftedIds.has(player.id));
            if (top) draftPlayer(top, false);
          }}
          view={view}
          onView={setView}
          removedCount={manual.size}
          posFilter={posFilter}
          onPosFilter={setPosFilter}
          dismissed={dismissed}
          onDismissPos={dismissPos}
          onRestorePos={restorePos}
          showDrafted={showDrafted}
          onShowDrafted={setShowDrafted}
          visibleCount={undrafted.length}
          draftedCount={draftedIds.size}
          suggestion={suggestion}
          watching={watching}
          onFocusPlayer={(player) => {
            setView('board');
            setSearch(player.name);
          }}
          onToggleStar={toggleStar}
          undrafted={undrafted}
          livePositions={livePositions}
          loading={loading}
          removedEntries={removedEntries}
          espnCount={espnDrafted.size}
          now={now}
          rows={visible}
          draftedIds={draftedIds}
          myIds={mine}
          espnIds={espnDrafted}
          sort={sort}
          onSort={handleSort}
          onDraft={draftPlayer}
          onUndo={undoPlayer}
          maxVor={maxVor}
          starred={starred}
          /* Fix 7: no keyboard means no cursor concept. Forced null rather than
             merely ignored — a live cursorId would make DraftBoard's
             scrollIntoView effect yank the list under the user's thumb. */
          cursorId={isMobile || cursorIdx === null ? null : (visible[cursorIdx]?.id ?? null)}
          myPlayers={myPlayers}
          teamName={teamName}
          rosterConfig={settings.roster}
          onNotMine={notMine}
        />
      )}

      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        teams={sync.data?.teams ?? []}
        espnRoster={sync.data?.roster_slots ?? null}
        onClose={() => setSettingsOpen(false)}
        onSave={applySettings}
        onTest={(next) => sync.runSync(next)}
        onClearManual={() => {
          setManual(new Set());
          setMine(new Set());
        }}
        manualCount={manual.size}
      />

      <Toast toast={toast} onUndo={undoPlayer} onDismiss={() => setToast(null)} />
    </div>
    </TooltipProvider>
  );
}
