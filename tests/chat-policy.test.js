/**
 * Minimal node smoke tests for ORVO chat policy.
 * Run: node tests/chat-policy.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/chat-policy.js'), 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(code.replace('(typeof window !== \'undefined\' ? window : globalThis)', 'window'), sandbox);
const { validateChatMessage } = sandbox.window.ORVO_CHAT;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(validateChatMessage('hello', 'open').ok, 'plain text ok');
assert(!validateChatMessage('email me at a@b.com', 'open').ok, 'email blocked');
assert(!validateChatMessage('wa.me/123', 'open').ok, 'whatsapp blocked');
assert(validateChatMessage('demo https://github.com/org/repo', 'open').ok, 'github allowed pre-pay');
assert(!validateChatMessage('see https://example.com/x', 'open').ok, 'random url blocked pre-pay');
assert(validateChatMessage('see https://example.com/x', 'funded').ok, 'random url allowed after pay');

console.log('chat-policy tests passed');
