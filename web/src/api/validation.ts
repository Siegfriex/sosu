// Client-side input validation. Rules are frontend decisions until the domain contract fixes them.
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

// OPEN (HANDOFF §8-4): accepted URL rule not yet confirmed — current MVP rule is the instagram.com host only.
export const isValidInstagramUrl = (v: string) => {
  try { const u = new URL(v.trim()); return /(^|\.)instagram\.com$/.test(u.hostname); } catch { return false; }
};
