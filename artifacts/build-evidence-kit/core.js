// Selected-text checks and SHA-256 provenance, not a security certificate.
export const LIMITS = Object.freeze({ files: 500, fileBytes: 1000000, totalBytes: 20000000 });
const RULES = [
  ['personal-email', /\b[A-Z0-9._%+-]+@(?:gmail|outlook|hotmail|yahoo|icloud)\.com\b/i],
  ['street-address', /\b\d{2,5}\s+[a-z]+(?:\s+[a-z]+){0,3}\s+(?:street|road|drive|avenue|lane|court)\b/i],
  ['named-institution', /\b(?:[A-Z][a-z]+[ \t]){1,5}(?:High School|Middle School|Elementary School)\b/],
  ['private-absolute-path', /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)/i],
  ['credential-assignment', /\b(?:password|secret|token|api[_ -]?key)["']?\s*[:=]\s*(?:["']\s*[^"'\r\n]+["']|[a-z0-9+\/_=-]{8,})/i],
  ['vendor-secret', /\b(?:ghp_|github_pat_|sk-|sk_|xoxb-|AKIA|AIza|tskey-)[a-z0-9_-]{12,}/i],
  ['title-dash', /^(?:#{1,6}\s.*|.*<title>.*)[\u2013\u2014]/]
];

export function safePath(name) {
  if (typeof name !== 'string' || !name || name.length > 300 || name.startsWith('/') || name.includes('\\') || /[\u0000-\u001f\u007f]/.test(name)) throw new TypeError('Use a relative public file path');
  const parts = name.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part === '.git' || part === 'node_modules' || part.startsWith('.env'))) throw new TypeError('Private, hidden-state or traversal paths are not accepted');
  return name;
}

export function inspectText(name, text) {
  if (typeof text !== 'string') throw new TypeError('Text files must be decoded strings');
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const [code, pattern] of RULES) if (pattern.test(line)) findings.push({ path: name, line: index + 1, code });
  }
  return findings;
}

export async function auditFiles(files, crypto = globalThis.crypto) {
  if (!Array.isArray(files) || !files.length || files.length > LIMITS.files) throw new TypeError('Select from 1 through 500 text files');
  const names = new Set(), prepared = [];
  let totalBytes = 0;
  for (const [index, file] of files.entries()) {
    const original = safePath(file.name);
    if (names.has(original)) throw new TypeError('Duplicate file paths are not accepted');
    names.add(original);
    if (typeof file.text !== 'string' || file.text.includes('\0')) throw new TypeError('Only decoded text files are supported');
    const data = new TextEncoder().encode(file.text);
    totalBytes += data.byteLength;
    if (data.byteLength > LIMITS.fileBytes || totalBytes > LIMITS.totalBytes) throw new RangeError('Selected text exceeds the size limit');
    const privateName = inspectText('filename', original).length > 0;
    const name = privateName ? `redacted-file-${index + 1}` : original;
    const findings = inspectText(name, file.text);
    if (privateName) findings.push({ path: name, line: 0, code: 'private-file-name' });
    prepared.push({ name, data, findings });
  }
  prepared.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const manifest = [], findings = [];
  for (const file of prepared) {
    const digest = await crypto.subtle.digest('SHA-256', file.data);
    manifest.push({ path: file.name, bytes: file.data.byteLength, sha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') });
    findings.push(...file.findings);
  }
  return { schemaVersion: 1, scope: 'selected-text-files-only', files: manifest, findings, passesAutomatedTextChecks: findings.length === 0, disclosure: 'AI-assisted tool. Hashes identify selected bytes; passing these checks does not establish authorship, complete privacy, security, testing or reward eligibility.' };
}
