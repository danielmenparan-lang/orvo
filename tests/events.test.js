/**
 * Smoke tests for ORVO_EVENTS stub.
 * Run: node tests/events.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/events.js'), 'utf8');
const sandbox = { console, CustomEvent: class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init && init.detail; }
} };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.dispatchEvent = () => {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const api = sandbox.ORVO_EVENTS;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(api && typeof api.track === 'function', 'track exists');
api.track('unit_test', { ok: true });
const dump = api.dump();
assert(Array.isArray(dump) && dump.length >= 1, 'dump has events');
assert(dump[dump.length - 1].event === 'unit_test', 'last event name');

console.log('events tests passed');
