const { gmailFetch, buildRawEmail, json } = require('./lib/gmail');

const MAX_BATCH = 25;
const DEFAULT_DELAY_MS = 800;

function fill(template, row) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    return row[key] != null ? String(row[key]) : '';
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Invite approved ORVO builders to quote on a request.
 * Body: {
 *   builders: [{ email, name?, skills? }],
 *   subject: string (supports {{name}} {{title}} ...),
 *   body: string,
 *   title?, category?, budget?, link?,
 *   dryRun?: boolean,
 *   delayMs?: number
 * }
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { ok: false, error: 'Invalid JSON body' });
    }

    const buildersIn = Array.isArray(payload.builders) ? payload.builders : [];
    const builders = buildersIn
      .map((b) => ({
        email: String(b.email || b.to || '').trim(),
        name: String(b.name || b.full_name || '').trim(),
        skills: String(b.skills || '').trim(),
      }))
      .filter((b) => b.email && b.email.includes('@'));

    if (!builders.length) {
      return json(400, { ok: false, error: 'builders[] with email is required' });
    }
    if (builders.length > MAX_BATCH) {
      return json(400, {
        ok: false,
        error: `Max ${MAX_BATCH} builders per request — split into batches from the admin UI`,
      });
    }

    const subjectTpl = String(payload.subject || '').trim();
    const bodyTpl = String(payload.body || payload.text || '');
    if (!subjectTpl || !bodyTpl) {
      return json(400, { ok: false, error: 'subject and body are required' });
    }

    const job = {
      title: String(payload.title || '').trim(),
      category: String(payload.category || 'General').trim(),
      budget: String(payload.budget || 'See request').trim(),
      link: String(payload.link || 'https://fantastic-eclair-0b2c66.netlify.app/').trim(),
    };

    const dryRun = Boolean(payload.dryRun || payload.dry_run);
    const delayMs = Math.min(Math.max(Number(payload.delayMs || DEFAULT_DELAY_MS), 200), 3000);

    const results = [];
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < builders.length; i++) {
      const row = { ...job, ...builders[i] };
      const to = row.email;
      const subject = fill(subjectTpl, row);
      const body = fill(bodyTpl, row);

      if (dryRun) {
        results.push({ email: to, ok: true, dryRun: true, subject });
        continue;
      }

      try {
        const raw = buildRawEmail({ to, subject, body });
        const sentMsg = await gmailFetch('/users/me/messages/send', {
          method: 'POST',
          body: JSON.stringify({ raw }),
        });
        sent++;
        results.push({ email: to, ok: true, id: sentMsg.id });
        if (i < builders.length - 1) await sleep(delayMs);
      } catch (err) {
        failed++;
        results.push({ email: to, ok: false, error: String(err.message || err) });
      }
    }

    return json(200, {
      ok: failed === 0,
      purpose: 'invite-builders-to-quote',
      mode: dryRun ? 'dry-run' : 'send',
      total: builders.length,
      sent,
      failed,
      results,
    });
  } catch (err) {
    return json(500, { ok: false, error: String(err.message || err) });
  }
};
