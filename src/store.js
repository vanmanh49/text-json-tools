// Browser storage is a convenience: every access may throw (private mode, blocked site data).
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nothing to remove */ } },
};

export const MAX_SAVE = 2 * 1024 * 1024; // localStorage is ~5 MB per site in most browsers

export function settings() {
  try { return { remember: true, ...JSON.parse(store.get('tjt:settings') || '{}') }; } catch { return { remember: true }; }
}
