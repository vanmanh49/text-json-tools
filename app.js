import { textToJson, jsonToText, minify } from './tools.js';

const TABS = ['text-to-json', 'json-to-text', 'minify', 'compare'];

function showTab() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : TABS[0];
  for (const s of document.querySelectorAll('section[data-tab]')) s.hidden = s.dataset.tab !== tab;
  for (const a of document.querySelectorAll('nav a')) {
    if (a.hash === '#' + tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}
addEventListener('hashchange', showTab);
showTab();

export async function copy(text, button) {
  const label = (button.dataset.label ??= button.textContent); // survives a second click within 1.5s
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  setTimeout(() => (button.textContent = label), 1500);
}

const JSON_TOOLS = { 'text-to-json': textToJson, 'json-to-text': jsonToText, 'minify': minify };

for (const [tab, fn] of Object.entries(JSON_TOOLS)) {
  const section = document.querySelector(`section[data-tab="${tab}"]`);
  const input = section.querySelector('.in');
  const output = section.querySelector('.out');
  const err = section.querySelector('.err');
  input.addEventListener('input', () => {
    try {
      output.value = fn(input.value);
      err.textContent = '';
    } catch (e) {
      output.value = '';
      err.textContent = e.message;
    }
  });
  section.querySelector('.copy').addEventListener('click', e => copy(output.value, e.currentTarget));
}
