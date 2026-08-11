import type { DraftStatus } from '../types';

export interface StatusLabel {
  text: string;
  tone: string;
}

/**
 * Sync status → chip text + `.status-*` tone class.
 *
 * TopBar, the mobile app bar and the Sync sheet all print the same chip, so the
 * mapping lives in one place: a phone and a laptop watching the same draft must
 * never disagree about whether it is live.
 */
export function statusLabel(status: DraftStatus | null, error?: string | null): StatusLabel {
  if (error) return { text: 'sync error', tone: 'bad' };
  if (!status) return { text: 'not synced', tone: 'idle' };
  if (status.drafted) return { text: 'draft complete', tone: 'good' };
  if (status.in_progress) return { text: 'draft in progress', tone: 'live' };
  return { text: 'pre-draft', tone: 'idle' };
}
