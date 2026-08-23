/**
 * Lightweight client analytics stub (no third-party).
 * Founder can later pipe to PostHog / GA — keep names stable.
 * Persists last N events in localStorage for admin "Copy events".
 */
(function (global) {
  'use strict';
  const KEY = 'orvo_events_v1';
  const MAX = 200;
  let buf = [];
  try {
    const raw = global.localStorage?.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) buf = parsed.slice(-MAX);
    }
  } catch (_) { /* ignore */ }

  function persist() {
    try {
      global.localStorage?.setItem(KEY, JSON.stringify(buf.slice(-MAX)));
    } catch (_) { /* quota / private mode */ }
  }

  function track(event, props) {
    const row = {
      event: String(event || 'unknown'),
      props: props || {},
      ts: new Date().toISOString(),
    };
    buf.push(row);
    if (buf.length > MAX) buf.shift();
    persist();
    try {
      console.info('[ORVO]', row.event, row.props);
    } catch (_) { /* ignore */ }
    try {
      global.dispatchEvent(new CustomEvent('orvo:event', { detail: row }));
    } catch (_) { /* ignore */ }
  }
  function dump() { return buf.slice(); }
  function clear() {
    buf = [];
    try { global.localStorage?.removeItem(KEY); } catch (_) { /* ignore */ }
  }
  global.ORVO_EVENTS = { track, dump, clear };
})(typeof window !== 'undefined' ? window : globalThis);
