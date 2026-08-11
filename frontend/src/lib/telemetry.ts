/** Anonymous visit beacon -> our backend -> databender.co analytics.
 * Fire-and-forget: never throws, never delays render, sends no PII and
 * nothing ESPN-related. The backend is silent unless configured. */

function id(storage: Storage, key: string): string {
  let value = storage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    storage.setItem(key, value);
  }
  return value;
}

export function sendVisitBeacon(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const key of ['source', 'medium', 'campaign', 'term', 'content']) {
      const value = params.get(`utm_${key}`);
      if (value) utm[key] = value;
    }
    const body = JSON.stringify({
      visitor_id: id(window.localStorage, 'ffdraft:v1:visitor'),
      session_id: id(window.sessionStorage, 'ffdraft:v1:session'),
      referrer: document.referrer || '',
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      utm,
    });
    if (navigator.sendBeacon?.('/api/telemetry', new Blob([body], { type: 'application/json' }))) {
      return;
    }
    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* storage blocked or beacon unavailable — never let telemetry break the app */
  }
}
