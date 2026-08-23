/**
 * node tests/status-spine.test.js
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../js/status-spine.js'), 'utf8');
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);
const { requestSpineSteps } = sandbox.window.ORVO_STATUS || sandbox.ORVO_STATUS;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const open = requestSpineSteps('open');
assert(open[0].cls === 'now' && open[0].key === 'open', 'open is now');
assert(open.every((s, i) => i === 0 || s.cls === ''), 'later steps empty');

const funded = requestSpineSteps('funded');
assert(funded.find((s) => s.key === 'funded').cls === 'now', 'funded now');
assert(funded.find((s) => s.key === 'open').cls === 'done', 'open done before funded');

const cancelled = requestSpineSteps('cancelled');
assert(cancelled.length === 2, 'cancelled short rail');
assert(cancelled[1].key === 'cancelled' && cancelled[1].cls === 'now', 'cancelled now');

const disputed = requestSpineSteps('disputed');
assert(disputed.some((s) => s.key === 'disputed' && s.cls === 'now'), 'disputed now');

console.log('status-spine tests passed');
