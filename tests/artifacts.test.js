import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cents, dollars, validateRow, budget, exportBudget, importBudget } from '../artifacts/grant-bom-workbench/core.js';
import { safePath, inspectText, auditFiles } from '../artifacts/build-evidence-kit/core.js';
import { collectText } from '../artifacts/build-evidence-kit/cli.mjs';

const today = '2026-11-04';
// Synthetic test data only. No vendor price or human quote check is claimed.
const row = { partNumber: 'TEST-PART', description: 'Synthetic test fixture', quantity: 3, unitPrice: '0.10', supplier: 'DigiKey', quoteUrl: 'https://www.digikey.com/en/products', quotedOn: today };
const input = { rows: [row], shipping: '1.00', tax: '0', cap: '35' };

test('USD decimal conversion is exact, including quantities and negative remaining amounts', () => {
  assert.equal(cents('0.1'), 10n);
  assert.equal(dollars(101n), '1.01');
  assert.equal(dollars(-1n), '-0.01');
  assert.equal(budget(input, today).total, '1.30');
  assert.equal(budget({ ...input, cap: '1' }, today).remaining, '-0.30');
  assert.equal(budget({ ...input, cap: '1' }, today).withinBudget, false);
});

for (const amount of ['-1', 'NaN', 'Infinity', '1e2', '0.001', '.5', ' 1', '1 ', '1,000', '1000000', 1]) {
  test(`malformed amount ${String(amount)} is rejected`, () => assert.throws(() => cents(amount)));
}

test('BOM schema rejects missing, unknown and invalid quantity fields', () => {
  assert.throws(() => validateRow({ ...row, quantity: 0 }, today));
  assert.throws(() => validateRow({ ...row, quantity: 1.5 }, today));
  assert.throws(() => validateRow({ ...row, owner: 'not-a-BOM-field' }, today), /Unknown/);
  assert.throws(() => validateRow({ ...row, quotedOn: undefined }, today));
  assert.throws(() => budget({ ...input, rows: [] }, today));
  assert.throws(() => budget({ ...input, rows: Array(201).fill(row) }, today));
  assert.throws(() => budget({ ...input, cap: '0' }, today));
});

test('quote URLs reject off-vendor, credential and active-content paths', () => {
  for (const quoteUrl of ['javascript:alert(1)', 'http://www.digikey.com', 'https://digikey.com.evil.example', 'https://username:password@digikey.com', 'https://digikey.com/?token=example', 'https://digikey.com:8080/']) assert.throws(() => validateRow({ ...row, quoteUrl }, today));
  assert.throws(() => validateRow({ ...row, supplier: '__proto__' }, today));
  assert.equal(validateRow({ ...row, supplier: 'Mouser', quoteUrl: 'https://www.mouser.com' }, today).supplier, 'Mouser');
});

test('quote calendar dates are real, not future, with explicit stale-quote reporting', () => {
  for (const quotedOn of ['2026-02-29', '2026-11-05', '2026-13-01', 'not-a-date']) assert.throws(() => validateRow({ ...row, quotedOn }, today));
  assert.deepEqual(budget({ ...input, rows: [{ ...row, quotedOn: '2026-10-01' }] }, today).staleQuotes, [0]);
  assert.deepEqual(budget(input, today).staleQuotes, []);
});

test('budget round trips validated inputs without trusting imported computed totals', () => {
  const encoded = exportBudget(input, today);
  assert.equal(budget(importBudget(encoded, today), today).total, '1.30');
  assert.throws(() => importBudget(JSON.stringify({ schemaVersion: 1, ...input, total: '0' }), today), /Unknown/);
  assert.throws(() => importBudget(JSON.stringify({ schemaVersion: 2, ...input }), today), /schema/);
  assert.throws(() => importBudget('x'.repeat(250001), today), /limit/);
  assert.match(budget(input, today).quoteVerification, /not independently verified/);
});

test('private-looking BOM fields are rejected without echoing their values', () => {
  const values = [['example', 'gmail.com'].join('@'), ['9876', 'Example', 'Street'].join(' '), ['Example', 'High', 'School'].join(' '), ['/', 'Users', '/', 'example'].join('')];
  for (const description of values) {
    assert.throws(() => validateRow({ ...row, description }, today), (error) => !error.message.includes(description));
  }
});

test('evidence kit hashes actual UTF-8 bytes to the known SHA-256 vector', async () => {
  const report = await auditFiles([{ name: 'hello.txt', text: 'abc' }]);
  assert.equal(report.files[0].sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(report.files[0].bytes, 3);
  assert.equal(report.passesAutomatedTextChecks, true);
  assert.equal(report.scope, 'selected-text-files-only');
  assert.match(report.disclosure, /does not establish/);
});

test('evidence manifests are deterministic and reject duplicate names', async () => {
  const files = [{ name: 'z.txt', text: 'z' }, { name: 'a.txt', text: 'a' }];
  assert.deepEqual(await auditFiles(files), await auditFiles([...files].reverse()));
  await assert.rejects(auditFiles([files[0], files[0]]), /Duplicate/);
});

test('evidence path validation rejects traversal and private-state paths', () => {
  for (const name of ['/absolute.js', '../outside.js', 'a/../b.js', '.git/config', '.env.local', 'node_modules/test.js', 'a\\b.js', 'a//b.js']) assert.throws(() => safePath(name));
  assert.equal(safePath('src/core.js'), 'src/core.js');
});

test('findings contain locations and categories, never offending private values', async () => {
  const email = ['example', 'gmail.com'].join('@');
  const address = ['9876', 'Example', 'Street'].join(' ');
  const report = await auditFiles([{ name: 'notes.md', text: email + '\n' + address }]);
  assert.equal(report.passesAutomatedTextChecks, false);
  assert.deepEqual(report.findings.map((finding) => finding.code), ['personal-email', 'street-address']);
  assert.equal(JSON.stringify(report).includes(email), false);
  assert.equal(JSON.stringify(report).includes(address), false);
});

test('private-looking filenames are redacted rather than copied into evidence', async () => {
  const name = ['Example', 'High', 'School'].join(' ') + '.txt';
  const report = await auditFiles([{ name, text: 'plain text' }]);
  assert.equal(report.files[0].path, 'redacted-file-1');
  assert.equal(JSON.stringify(report).includes(name), false);
  assert.equal(report.findings[0].code, 'private-file-name');
});

test('credential-like assignments and non-ASCII title dashes are detected', () => {
  const assignment = ['password', '=', '"', 'not-a-real-secret', '"'].join(' ');
  assert.equal(inspectText('sample.txt', assignment)[0].code, 'credential-assignment');
  assert.equal(inspectText('sample.json', JSON.stringify({ api_key: 'not-a-real-secret' }))[0].code, 'credential-assignment');
  assert.equal(inspectText('sample.md', '# A' + String.fromCodePoint(0x2014) + 'B')[0].code, 'title-dash');
});

test('evidence count, byte and binary limits fail closed', async () => {
  await assert.rejects(auditFiles([]), /Select/);
  await assert.rejects(auditFiles(Array(501).fill({ name: 'a.js', text: '' })), /500/);
  await assert.rejects(auditFiles([{ name: 'a.js', text: 'x'.repeat(1000001) }]), /size/);
  await assert.rejects(auditFiles([{ name: 'a.js', text: '\0' }]), /text/);
});

test('CLI executes from a path with spaces, skips private state and rejects symlinks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reward-evidence-test-'));
  try {
    await writeFile(join(directory, 'example.js'), 'const example = 1;\n');
    await writeFile(join(directory, '.env'), 'not-real-private-state');
    await mkdir(join(directory, 'node_modules'));
    await writeFile(join(directory, 'node_modules', 'ignored.js'), 'not-public-source');
    const files = await collectText(directory);
    assert.deepEqual(files.map((file) => file.name), ['example.js']);
    const cli = fileURLToPath(new URL('../artifacts/build-evidence-kit/cli.mjs', import.meta.url));
    const output = JSON.parse(execFileSync(process.execPath, [cli, directory], { encoding: 'utf8' }));
    assert.equal(output.files.length, 1);
    assert.equal(JSON.stringify(output).includes(directory), false);
    await symlink(join(directory, 'example.js'), join(directory, 'linked.js'));
    await assert.rejects(collectText(directory), /Symlinks/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
