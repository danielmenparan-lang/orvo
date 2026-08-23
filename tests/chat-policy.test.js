/**
 * Minimal node smoke tests for ORVO chat policy.
 * Run: node tests/chat-policy.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '../js/chat-policy.js'), 'utf8');
const sandbox = { console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const api = sandbox.ORVO_CHAT || sandbox.window.ORVO_CHAT;
const { validateChatMessage, canOpenChat } = api;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(validateChatMessage('hello', 'open').ok, 'plain text ok');
assert(!validateChatMessage('email me at a@b.com', 'open').ok, 'email blocked');
assert(!validateChatMessage('wa.me/123', 'open').ok, 'whatsapp blocked');
assert(validateChatMessage('demo https://github.com/org/repo', 'open').ok, 'github allowed pre-pay');
assert(!validateChatMessage('see https://example.com/x', 'open').ok, 'random url blocked pre-pay');
assert(validateChatMessage('see https://example.com/x', 'funded').ok, 'random url allowed after pay');

const req = { id: 'r1', user_id: 'client1', assigned_builder_id: null };
assert(!canOpenChat(null, { myId: 'u1' }).ok, 'no request');
assert(!canOpenChat(req, {}).ok, 'no myId');
assert(canOpenChat(req, { myId: 'client1' }).ok, 'owner ok');
assert(canOpenChat(req, { myId: 'admin', isAdmin: true }).ok, 'admin ok');
assert(canOpenChat(req, { myId: 'b1', hasQuoted: true }).ok, 'quoted ok');
assert(canOpenChat(req, { myId: 'b2', hasInvite: true }).ok, 'invited ok');
assert(!canOpenChat(req, { myId: 'stranger' }).ok, 'stranger blocked');
assert(
  canOpenChat({ ...req, assigned_builder_id: 'b3' }, { myId: 'b3' }).ok,
  'assigned ok',
);

console.log('chat-policy tests passed');
