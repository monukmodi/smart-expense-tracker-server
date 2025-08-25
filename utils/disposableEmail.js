import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const domainsPath = path.resolve(__dirname, '../data/disposable_domains.json');

let disposableSet = null;

function loadDomains() {
  if (disposableSet) return disposableSet;
  try {
    const raw = fs.readFileSync(domainsPath, 'utf-8');
    const arr = JSON.parse(raw);
    disposableSet = new Set(arr.map((d) => String(d).toLowerCase()));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[disposableEmail] failed to load list:', e?.message || e);
    disposableSet = new Set();
  }
  return disposableSet;
}

export function isDisposableEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return false;
  const domain = email.split('@').pop().toLowerCase().trim();
  const set = loadDomains();
  return set.has(domain);
}
