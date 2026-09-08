#!/usr/bin/env node
/** Back-compat → scripts/invite-builders.js */
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync(process.execPath, [path.join(__dirname, 'invite-builders.js'), ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(r.status == null ? 1 : r.status);
