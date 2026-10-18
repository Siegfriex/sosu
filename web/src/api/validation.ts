// Client-side input validation, mirroring the backend contract where one exists.
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

// Mirrors SOSU_py/app/contracts/prescription.py is_valid_instagram_reel_url: http(s), host instagram.com / www. / m.,
// path /reel/<code> or /reels/<code> (optional trailing slash). /p/ posts rejected. Query/hash are ignored like urlparse().path.
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
const REEL_PATH = /^\/(reel|reels)\/[A-Za-z0-9_-]+\/?$/;
export const isValidInstagramUrl = (v: string) => {
  try {
    const u = new URL(v.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && INSTAGRAM_HOSTS.has(u.hostname) && REEL_PATH.test(u.pathname);
  } catch { return false; }
};
