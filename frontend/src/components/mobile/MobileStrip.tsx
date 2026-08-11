import { useScrollDirection } from '../../hooks/useScrollDirection';
import type { Suggestion } from '../../lib/suggest';
import SuggestedStrip from './SuggestedStrip';

interface Props {
  suggestion: Suggestion | null;
  onOpen: () => void;
}

/**
 * The suggested strip plus its auto-hide (docs/mobile-design.md §3③,
 * FINAL DECISION 7).
 *
 * `useScrollDirection` lives here rather than in DraftPage so the scroll
 * listener is only ever mounted below 640px — this component is rendered
 * conditionally, the hook is not called conditionally. If the hook ever
 * misbehaves the worst case is a permanently visible strip, which is exactly
 * the "degrades cleanly" requirement.
 */
export default function MobileStrip({ suggestion, onOpen }: Props) {
  const direction = useScrollDirection();
  return (
    <SuggestedStrip suggestion={suggestion} hidden={direction === 'down'} onOpen={onOpen} />
  );
}
