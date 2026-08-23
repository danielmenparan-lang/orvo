/**
 * Lightweight client analytics stub (no third-party).
 * Founder can later pipe to PostHog / GA — keep names stable.
 */
(function (global) {
  'use strict';
  const buf = [];
  function track(event, props) {
    const row = {
      event: String(event || 'unknown'),
      props: props || {},
      ts: new Date().toISOString(),
    };
    buf.push(row);
    if (buf.length > 200) buf.shift();
    try {
      console.info('[ORVO]', row.event, row.props);
    } catch (_) { /* ignore */ }
    try {
      global.dispatchEvent(new CustomEvent('orvo:event', { detail: row }));
    } catch (_) { /* ignore */ }
  }
  function dump() { return buf.slice(); }
  global.ORVO_EVENTS = { track, dump };
})(typeof window !== 'undefined' ? window : globalThis);
