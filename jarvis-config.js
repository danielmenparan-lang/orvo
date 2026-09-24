/**
 * ORVO Jarvis — personal settings for דניאל
 * Edit wake time, name, language. Kept client-side for v1.
 */
window.JARVIS = {
  name: 'דניאל',
  nameEn: 'Daniel',
  agentName: 'Jarvis',
  timezone: 'Asia/Jerusalem',
  locale: 'he-IL',
  /** Default alarm — change in the UI; this is the first-load fallback */
  wakeTime: '07:00',
  /** Hebrew voice preference (browser picks closest match) */
  voiceLang: 'he-IL',
  /** Escalation: soft chime → voice → louder chime */
  escalateSeconds: 45,
  snoozeMinutes: 5,
  /** Owner email — morning briefing target later */
  ownerEmail: 'danielmen.paran@gmail.com',
  /** ORVO live site for context links */
  orvoUrl: 'https://fantastic-eclair-0b2c66.netlify.app/',
};
