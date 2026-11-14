// Static stroke icons in the Lucide style (never user text).
const ICONS = {
  copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  paste: <><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>,
  clear: <path d="M18 6 6 18M6 6l12 12" />,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
  swap: <><path d="m16 3 4 4-4 4" /><path d="M20 7H4" /><path d="m8 21-4-4 4-4" /><path d="M4 17h16" /></>,
  sample: <><path d="M9 3h6" /><path d="M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /></>,
  theme: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" /></>,
};

export function IconButton({ icon, label, title = label, onClick, disabled, className = '', id }) {
  return (
    <button type="button" id={id} className={'icon-btn' + (className && ' ' + className)} title={title} aria-label={title} onClick={onClick} disabled={disabled}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[icon]}</svg>
      <span className="label">{label}</span>
    </button>
  );
}

// Briefly replace a button's label (shown even on phones, where labels are otherwise hidden).
// Imperative on purpose: React never re-renders the span's text, so the swap survives re-renders.
export function flash(button, text) {
  const label = button.querySelector('.label');
  label.dataset.label ??= label.textContent;
  label.textContent = text;
  button.classList.add('flashing');
  clearTimeout(button._flash);
  button._flash = setTimeout(() => {
    label.textContent = label.dataset.label;
    button.classList.remove('flashing');
  }, 1500);
}
