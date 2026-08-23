/**
 * ORVO chat allowlist / block helpers (browser)
 * Keep in sync with sql/003 message_block_reason intent.
 */
(function (global) {
  'use strict';

  const CHAT_OFF_PLATFORM = [
    /whatsapp\.com|wa\.me|web\.whatsapp/i,
    /t\.me\/|telegram\.(me|org)/i,
    /paypal\.(com|me)|venmo\.com|cash\.app|zellepay/i,
    /linkedin\.com\/in\//i,
    /facebook\.com|fb\.com|messenger\.com/i,
    /instagram\.com|twitter\.com|x\.com/i,
    /mailto:/i,
    /calendly\.com|calendar\.app/i,
    /discord\.gg|discord\.com\/invite/i,
  ];
  const CHAT_AGENT_HOST = [
    /github\.com|gitlab\.com|bitbucket\.org/i,
    /vercel\.app|netlify\.app|pages\.dev|cloudflare\.com|workers\.dev/i,
    /replit\.app|repl\.co|render\.com|railway\.app|fly\.dev|herokuapp\.com/i,
    /bubble\.io|glide\.page|softr\.app|webflow\.io/i,
    /supabase\.co/i,
    /n8n\.io|make\.com|zapier\.com/i,
    /lovable\.app|v0\.dev|bolt\.new|cursor\.com/i,
    /notion\.site|airtable\.com/i,
    /docs\.google\.com|drive\.google\.com/i,
    /openai\.com\/g\//i,
    /huggingface\.co/i,
  ];
  const CHAT_EMAIL = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/;
  const CHAT_URL = /(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-zA-Z0-9-]+\.)+(?:com|io|app|dev|co|net|org|ai|me)\/[^\s]*/gi;

  function chatUrls(text) {
    return text.match(CHAT_URL) || [];
  }

  function chatOffPlatform(url) {
    return CHAT_OFF_PLATFORM.some((re) => re.test(url));
  }

  function chatAgentLink(url) {
    if (chatOffPlatform(url)) return false;
    return CHAT_AGENT_HOST.some((re) => re.test(url));
  }

  function chatPaidPhase(status) {
    return status === 'in_progress' || status === 'funded' || status === 'delivered'
      || status === 'completed' || status === 'awaiting_payment';
  }

  function chatHasPhone(text) {
    const t = String(text || '')
      .replace(/\$\s?[\d,]+(?:\.\d+)?/g, ' ')
      .replace(/\b[\d,]+\s*(?:usd|dollars?|€|eur|₪|ils)\b/gi, ' ');
    if (/(?:\+972|972|0)[-.\s]?5\d[-.\s]?\d{7}/.test(t)) return true;
    if (/(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(t)) return true;
    const digits = t.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }

  function validateChatMessage(body, requestStatus) {
    if (CHAT_EMAIL.test(body)) {
      return { ok: false, msg: 'Email addresses are blocked. Keep communication on ORVO.' };
    }
    if (chatHasPhone(body)) {
      return { ok: false, msg: 'Phone numbers are blocked. Keep communication on ORVO.' };
    }
    for (const raw of chatUrls(body)) {
      const url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
      if (chatOffPlatform(url)) {
        return { ok: false, msg: 'WhatsApp, PayPal, social, and similar links are not allowed.' };
      }
      if (!chatPaidPhase(requestStatus) && !chatAgentLink(url)) {
        return {
          ok: false,
          msg: 'Before payment: agent/demo links only (GitHub, Vercel, n8n, etc.). After payment, more links are allowed.',
        };
      }
    }
    return { ok: true };
  }

  /**
   * Pure relationship gate (no network). Pass flags from quotes/invites queries.
   * @param {object|null} request
   * @param {{ myId?: string, isAdmin?: boolean, hasQuoted?: boolean, hasInvite?: boolean }} ctx
   */
  function canOpenChat(request, ctx) {
    const myId = ctx && ctx.myId;
    if (!request || !myId) return { ok: false, reason: 'Sign in required.' };
    if (ctx.isAdmin) return { ok: true };
    if (request.user_id === myId) return { ok: true };
    if (request.assigned_builder_id === myId) return { ok: true };
    if (ctx.hasQuoted) return { ok: true };
    if (ctx.hasInvite) return { ok: true };
    return { ok: false, reason: 'Chat opens after you quote or get invited.' };
  }

  global.ORVO_CHAT = {
    validateChatMessage,
    canOpenChat,
    chatPaidPhase,
    chatHasPhone,
    chatOffPlatform,
    chatAgentLink,
  };
})(typeof window !== 'undefined' ? window : globalThis);
