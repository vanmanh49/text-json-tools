import { base64Encode } from './tools.js';

const b64url = s => base64Encode(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const nowSec = Math.floor(Date.now() / 1000);
const SAMPLE_JWT = [
  b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  b64url(JSON.stringify({ sub: '1234567890', name: 'Ann Nguyễn', role: 'admin', iat: nowSec - 300, exp: nowSec + 3600 })),
  'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
].join('.');
const PERSON = { name: 'Ann Nguyen', age: 31, active: true, email: 'ann@example.com', tags: ['dev', 'ops'], address: { city: 'Hanoi', geo: { lat: 21.03, lng: 105.85 } }, manager: null };
const CONFIG_A = 'server:\n  host: example.com\n  port: 8080\n  timeout: 30\nlogging:\n  level: info\n  file: app.log\nfeatures:\n  - search\n  - export\n';
const CONFIG_B = 'server:\n  host: example.com\n  port: 9090\n  timeout: 30\n  retries: 3\nlogging:\n  level: debug\n  file: app.log\nfeatures:\n  - search\n  - export\n  - share\n';
// textarea id -> text, or { left, right } to fill both Compare sides.
export const SAMPLES = {
  'fmt-in': JSON.stringify(PERSON),
  't2j-in': JSON.stringify(JSON.stringify(PERSON)),
  'j2t-in': JSON.stringify(PERSON, null, 2),
  'min-in': JSON.stringify(PERSON, null, 2),
  'html-in': '<!DOCTYPE html><html><head><title>Profile</title><style>body{font-family:sans-serif;margin:2em}.tag{background:#eef;padding:2px 6px;border-radius:4px}</style></head><body><h1>Ann Nguyen</h1><p>Developer in <b>Hanoi</b>.</p><ul><li><span class="tag">dev</span></li><li><span class="tag">ops</span></li></ul><a href="mailto:ann@example.com">Email Ann</a></body></html>',
  'jwt-in': SAMPLE_JWT,
  'enc-in': 'Xin chào, thế giới! name=Ann Nguyen&tags=dev,ops',
  'lines-in': 'banana\nitem10\nApple\nitem2\nbanana\n  cherry  \n\nitem1\n',
  'time-in': String(nowSec),
  'hash-in': 'Xin chào, thế giới!',
  'qr-in': 'https://example.com/?name=Ann Nguyễn',
  left: { left: CONFIG_A, right: CONFIG_B },
  right: { left: CONFIG_A, right: CONFIG_B },
};
