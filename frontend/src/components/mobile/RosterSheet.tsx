import RosterPanel from '../RosterPanel';
import type { Player, Pos, RosterConfig } from '../../types';
import Sheet from './Sheet';

interface Props {
  open: boolean;
  players: Player[];
  teamName: string | null;
  dismissed: Pos[];
  onDismiss: (pos: Pos) => void;
  config: RosterConfig;
  mineIds: Set<string>;
  onNotMine: (player: Player) => void;
  onRestore: (player: Player) => void;
  onClose: () => void;
}

/**
 * The Roster sheet (docs/mobile-design.md §4): `RosterPanel` verbatim, no
 * mobile fork. Everything the spec asks for here is CSS — the panel's sticky
 * positioning unset, 48px slot rows, 44×44 slot-correction buttons — and lives
 * in mobile-panels.css, so the two platforms can never drift.
 *
 * The panel's `X slots are full → Hide QB` block MUST render on mobile: with
 * `.chip-x` cut from the rail, it and the Board options sheet are the only ways
 * to hide a position (§5 action 18).
 */
export default function RosterSheet({
  open,
  players,
  teamName,
  dismissed,
  onDismiss,
  config,
  mineIds,
  onNotMine,
  onRestore,
  onClose,
}: Props) {
  return (
    <Sheet open={open} title="My Roster" onClose={onClose}>
      <RosterPanel
        players={players}
        teamName={teamName}
        dismissed={dismissed}
        onDismiss={onDismiss}
        config={config}
        mineIds={mineIds}
        onNotMine={onNotMine}
        onRestore={onRestore}
      />
    </Sheet>
  );
}
