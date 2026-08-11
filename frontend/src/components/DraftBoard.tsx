import type { MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Column, SortKey, SortState } from '../lib/board';
import { COLUMNS } from '../lib/board';
import { EM_DASH, fmtNum, fmtSigned, tierClass } from '../lib/format';
import type { Player } from '../types';
import PlayerName, { PlayerBadges } from './PlayerName';
import { useTooltip } from './TooltipProvider';

const PAGE = 250;

interface Props {
  rows: Player[];
  draftedIds: Set<string>;
  myIds: Set<string>;
  espnIds: Set<string>;
  sort: SortState;
  onSort: (key: SortKey) => void;
  onDraft: (player: Player, mine: boolean) => void;
  onUndo: (player: Player) => void;
  maxVor: number;
  loading: boolean;
  starred: Set<string>;
  onToggleStar: (player: Player) => void;
  cursorId: string | null;
}

function cellValue(player: Player, column: Column): string {
  const raw = player[column.key];
  if (typeof raw === 'string') return raw || EM_DASH;
  if (column.pct) {
    return raw === null || raw === undefined ? EM_DASH : `${Math.round(raw * 100)}%`;
  }
  if (column.signed) return fmtSigned(raw, column.digits ?? 1);
  return fmtNum(raw, column.digits ?? 1);
}

function vorWidth(vor: number | null, maxVor: number): string {
  if (vor === null || vor <= 0 || maxVor <= 0) return '0%';
  return `${Math.min(100, (vor / maxVor) * 100).toFixed(1)}%`;
}

export default function DraftBoard({
  rows,
  draftedIds,
  myIds,
  espnIds,
  sort,
  onSort,
  onDraft,
  onUndo,
  maxVor,
  loading,
  starred,
  onToggleStar,
  cursorId,
}: Props) {
  const [limit, setLimit] = useState(PAGE);
  const cursorRef = useRef<HTMLTableRowElement | null>(null);
  const tip = useTooltip();

  useEffect(() => {
    setLimit(PAGE);
  }, [rows.length, sort.key, sort.dir]);

  useEffect(() => {
    cursorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [cursorId]);

  const shown = rows.slice(0, limit);

  function handleDraft(event: MouseEvent<HTMLButtonElement>, player: Player) {
    onDraft(player, event.altKey || event.metaKey || event.shiftKey);
  }

  return (
    <section className="board">
      <div className="table-scroll">
        <table className="board-table">
          <thead>
            <tr>
              <th className="star-col" aria-label="Watchlist" />
              {COLUMNS.map((column) => {
                const isSorted = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    className={`${column.numeric ? 'num' : ''} ${isSorted ? 'sorted' : ''}`}
                    aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    title={column.title}
                  >
                    <button type="button" className="th-btn" onClick={() => onSort(column.key)}>
                      {column.label}
                      <span className="arrow">{isSorted ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  </th>
                );
              })}
              <th className="actions-col">Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((player) => {
              const drafted = draftedIds.has(player.id);
              const mine = myIds.has(player.id);
              const byEspn = espnIds.has(player.id);
              const isCursor = cursorId === player.id;
              const isStarred = starred.has(player.id);
              return (
                <tr
                  key={player.id}
                  ref={isCursor ? cursorRef : undefined}
                  className={`${drafted ? 'drafted' : ''} ${mine ? 'mine' : ''} ${isCursor ? 'cursor' : ''}`}
                  onMouseEnter={(e) =>
                    tip.show(player, e.currentTarget.getBoundingClientRect(), e.clientX)
                  }
                  onMouseLeave={tip.hide}
                >
                  <td className="star-col">
                    <button
                      type="button"
                      className={isStarred ? 'star on' : 'star'}
                      aria-label={isStarred ? `Unstar ${player.name}` : `Star ${player.name}`}
                      title={isStarred ? 'Remove from watchlist' : 'Add to watchlist (W)'}
                      onClick={() => onToggleStar(player)}
                    >
                      {isStarred ? '★' : '☆'}
                    </button>
                  </td>
                  {COLUMNS.map((column) => {
                    if (column.key === 'name') {
                      return (
                        <td key={column.key} className="name-cell">
                          <PlayerName player={player} />
                          {mine && <span className="tag tag-mine">MINE</span>}
                          {byEspn && <span className="tag tag-espn">ESPN</span>}
                          <PlayerBadges player={player} />
                        </td>
                      );
                    }
                    if (column.key === 'pos') {
                      return (
                        <td key={column.key}>
                          <span className={`badge pos-${player.pos}`}>{player.pos}</span>
                        </td>
                      );
                    }
                    if (column.key === 'tier') {
                      return (
                        <td key={column.key} className="num">
                          <span className={tierClass(player.tier)}>
                            {player.tier === null ? EM_DASH : player.tier}
                          </span>
                        </td>
                      );
                    }
                    if (column.key === 'vor') {
                      return (
                        <td key={column.key} className="num vor-cell">
                          <span>{fmtNum(player.vor, 1)}</span>
                          <span
                            className="vor-bar"
                            style={{ width: vorWidth(player.vor, maxVor) }}
                            aria-hidden="true"
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={column.key} className={column.numeric ? 'num' : ''}>
                        {cellValue(player, column)}
                      </td>
                    );
                  })}
                  <td className="actions-col">
                    {drafted ? (
                      <button
                        type="button"
                        className="btn tiny"
                        onClick={() => onUndo(player)}
                        title={byEspn ? 'Player is drafted in ESPN — undo only clears manual marks' : 'Undo'}
                      >
                        Undo
                      </button>
                    ) : (
                      <span className="row-actions">
                        <button
                          type="button"
                          className="btn tiny primary"
                          onClick={(e) => handleDraft(e, player)}
                          title="Remove from board — drafted by another team (hold Alt/Cmd/Shift if it was your pick)"
                        >
                          ✕ Remove
                        </button>
                        <button
                          type="button"
                          className="btn tiny"
                          onClick={() => onDraft(player, true)}
                          title="My pick — remove from board and add to my roster"
                        >
                          Mine
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && rows.length === 0 && <p className="empty">No players match these filters.</p>}
      {rows.length > shown.length && (
        <div className="board-more">
          <button type="button" className="btn" onClick={() => setLimit(limit + PAGE)}>
            Show more ({shown.length} of {rows.length})
          </button>
        </div>
      )}
    </section>
  );
}
