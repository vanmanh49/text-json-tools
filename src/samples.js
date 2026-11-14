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
  'jwt-in': SAMPLE_JWT,
  'enc-in': 'Xin chào, thế giới! name=Ann Nguyen&tags=dev,ops',
  left: { left: CONFIG_A, right: CONFIG_B },
  right: { left: CONFIG_A, right: CONFIG_B },
};
