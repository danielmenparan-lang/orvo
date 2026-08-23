/**
 * Request status rail helpers (unit-tested).
 */
(function (global) {
  'use strict';

  function requestSpineSteps(status) {
    const order = ['open', 'awaiting_payment', 'funded', 'delivered', 'completed'];
    const labels = {
      open: 'Open',
      awaiting_payment: 'Awaiting pay',
      funded: 'Funded',
      delivered: 'Delivered',
      completed: 'Done',
      cancelled: 'Cancelled',
      disputed: 'Disputed',
    };
    let s = status || 'open';
    if (s === 'in_progress') s = 'funded';
    if (s === 'cancelled') {
      return [
        { key: 'open', label: labels.open, cls: 'done' },
        { key: 'cancelled', label: labels.cancelled, cls: 'now' },
      ];
    }
    if (s === 'disputed') {
      return order.map((k) => ({
        key: k,
        label: labels[k],
        cls: k === 'delivered' ? 'now' : (order.indexOf(k) < order.indexOf('delivered') ? 'done' : ''),
      })).concat([{ key: 'disputed', label: labels.disputed, cls: 'now' }]);
    }
    const idx = Math.max(0, order.indexOf(s));
    return order.map((k, i) => ({
      key: k,
      label: labels[k],
      cls: i < idx ? 'done' : (i === idx ? 'now' : ''),
    }));
  }

  global.ORVO_STATUS = { requestSpineSteps };
})(typeof window !== 'undefined' ? window : globalThis);
