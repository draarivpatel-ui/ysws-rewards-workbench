import { auditFiles, LIMITS } from './core.js';
const el = (id) => document.getElementById(id);
let report = null, generation = 0;

el('files').addEventListener('change', async () => {
  const current = ++generation;
  report = null; el('download').disabled = true; el('manifest').replaceChildren(); el('findings').replaceChildren();
  const selected = [...el('files').files];
  try {
    if (!selected.length || selected.length > LIMITS.files || selected.some((file) => file.size > LIMITS.fileBytes) || selected.reduce((sum, file) => sum + file.size, 0) > LIMITS.totalBytes) throw new Error('Select text files within the stated limits');
    el('status').textContent = 'Checking the selected text locally.';
    const files = [];
    for (const file of selected) files.push({ name: file.name, text: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) });
    const result = await auditFiles(files);
    if (current !== generation) return;
    report = result;
    for (const file of report.files) {
      const row = document.createElement('tr');
      for (const value of [file.path, file.bytes, file.sha256]) { const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell); }
      el('manifest').append(row);
    }
    for (const finding of report.findings) { const item = document.createElement('li'); item.textContent = `${finding.path}, line ${finding.line}, ${finding.code}`; el('findings').append(item); }
    el('status').textContent = `${report.files.length} selected text files checked. ${report.findings.length} findings. ${report.passesAutomatedTextChecks ? 'Automated text checks passed; manual review is still required.' : 'Resolve the findings before publication.'}`;
    el('download').disabled = false;
  } catch {
    if (current === generation) el('status').textContent = 'The selection could not be audited. Use public UTF-8 text files within the stated limits. No data was sent.';
  }
});

el('download').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'build-evidence.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
