import type { KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useRef } from 'react';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import { fmtNum } from '../../lib/format';
import type { Player } from '../../types';

interface Props {
  open: boolean;
  search: string;
  onSearch: (value: string) => void;
  results: Player[];
  onDraft: (player: Player, mine: boolean) => void;
  onClose: () => void;
}

/** Rows rendered per query — the answer is always near the top, and a long
 *  list under a live keyboard is scroll cost, not information. */
const MAX_ROWS = 40;

/**
 * Full-screen, keyboard-aware search (docs/mobile-design.md §4). The fastest
 * manual-removal path in the app: hear a name → gone in under 3s. Deliberately
 * NOT built on the `Sheet` primitive — a sheet caps at 85dvh and would put the
 * input under the keyboard, which is the exact failure this surface exists to
 * avoid.
 *
 * iOS Safari does not shrink the layout viewport when the keyboard opens, so
 * the overlay's bottom edge is pulled up by `useKeyboardInset()` (§9 risk 1);
 * that keeps the input and the confirm bar directly above the keys and lets the
 * results list scroll in what is actually visible.
 *
 * FINAL DECISION 2: keyboard **Go** and the confirm bar's ✕ Remove are ONE
 * handler (`confirmRemove`) on the top match. The inline `onEnter` path is not
 * used while this is open, so nothing can double-fire.
 */
export default function SearchOverlay({
  open,
  search,
  onSearch,
  results,
  onDraft,
  onClose,
}: Props) {
  const inset = useKeyboardInset();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    // autoFocus is correct here and only here (§4): this surface exists because
    // the user asked for the keyboard.
    inputRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const query = search.trim();
  const top = results[0] ?? null;

  /** Keeps the keyboard up so back-to-back removals cost no chrome round-trip. */
  function refocus() {
    inputRef.current?.focus();
  }

  /** Buttons must not steal focus from the input mid-run. */
  function holdFocus(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function draft(player: Player, mine: boolean) {
    onDraft(player, mine);
    // draftPlayer() already clears the query; stated explicitly so the overlay's
    // contract holds whatever handler is wired in.
    onSearch('');
    refocus();
  }

  /** The one shared commit path: confirm-bar ✕ Remove AND keyboard Go. */
  function confirmRemove() {
    if (!top) return;
    draft(top, false);
  }

  function onInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!query) return;
    confirmRemove();
  }

  return (
    <div
      className="searchov"
      role="dialog"
      aria-modal="true"
      aria-label="Search players"
      style={{ bottom: `${inset}px` }}
    >
      <div className="searchov-head">
        <h2 className="searchov-title">Search</h2>
        <button type="button" className="searchov-done" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="searchov-list">
        {query === '' && (
          <p className="searchov-hint">Type a few letters of a name, then tap ✕ to take them off the board.</p>
        )}
        {query !== '' && results.length === 0 && (
          <p className="searchov-hint">No players match “{query}”.</p>
        )}
        {results.slice(0, MAX_ROWS).map((player, index) => (
          <div className="searchov-row" key={player.id}>
            <span className="searchov-rank">{index + 1}</span>
            <span className={`badge pos-${player.pos}`}>{player.pos}</span>
            <span className="searchov-name">{player.name}</span>
            <span className="searchov-team">{player.team}</span>
            <span className="searchov-vor">{fmtNum(player.vor, 1)}</span>
            <button
              type="button"
              className="searchov-x"
              aria-label={`Remove ${player.name}`}
              onMouseDown={holdFocus}
              onClick={() => draft(player, false)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {top !== null && query !== '' && (
        <div className="searchov-confirm">
          <div className="searchov-confirm-who">
            <span className={`badge pos-${top.pos}`}>{top.pos}</span>
            <span className="searchov-confirm-name">{top.name}</span>
            <span className="searchov-team">
              {top.team} · {fmtNum(top.vor, 1)}
            </span>
          </div>
          <div className="searchov-confirm-acts">
            <button
              type="button"
              className="searchov-remove"
              onMouseDown={holdFocus}
              onClick={confirmRemove}
            >
              ✕ Remove
            </button>
            <button
              type="button"
              className="searchov-mine"
              onMouseDown={holdFocus}
              onClick={() => draft(top, true)}
            >
              Mine
            </button>
          </div>
        </div>
      )}

      <div className="searchov-inputrow">
        <span className="searchov-ico" aria-hidden="true">
          🔎
        </span>
        <input
          ref={inputRef}
          className="searchov-input"
          type="text"
          value={search}
          placeholder="Player or team…"
          aria-label="Search players"
          inputMode="search"
          enterKeyHint="go"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => onSearch(event.target.value)}
          onKeyDown={onInputKey}
        />
        {search !== '' && (
          <button
            type="button"
            className="searchov-clear"
            aria-label="Clear search"
            onMouseDown={holdFocus}
            onClick={() => {
              onSearch('');
              refocus();
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
