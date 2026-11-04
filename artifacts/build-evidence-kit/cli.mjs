// Read one user-specified source directory, excluding state and binary files.
import { readdir, readFile, stat, realpath } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { auditFiles, LIMITS } from './core.js';
import { fileURLToPath } from 'node:url';

const accepted = new Set(['.js', '.mjs', '.html', '.css', '.json', '.md', '.py', '.c', '.h', '.txt', '.yml', '.yaml']);
const excluded = new Set(['.git', 'node_modules', '__pycache__', 'sources', 'test-results', 'verification', 'video', 'reviews']);

export async function collectText(root) {
  const canonical = await realpath(resolve(root));
  if (canonical === sep || canonical === process.env.HOME) throw new Error('Select a specific public project, not a filesystem root');
  const files = [];
  let bytes = 0;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.env') || excluded.has(entry.name)) continue;
      if (entry.isSymbolicLink()) throw new Error('Symlinks are not accepted in release source');
      const path = resolve(directory, entry.name);
      if (!path.startsWith(canonical + sep)) throw new Error('Source escapes the selected root');
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && accepted.has(extname(entry.name))) {
        const size = (await stat(path)).size;
        bytes += size;
        if (size > LIMITS.fileBytes || files.length >= LIMITS.files || bytes > LIMITS.totalBytes) throw new Error('Source exceeds the text audit limit');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
        files.push({ name: relative(canonical, path).split(sep).join('/'), text });
      }
    }
  }
  await walk(canonical);
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node cli.mjs <one public source directory>');
    const report = await auditFiles(await collectText(process.argv[2]));
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (!report.passesAutomatedTextChecks) process.exitCode = 1;
  } catch {
    process.stderr.write('Audit failed. Select one public UTF-8 source directory within the stated limits.\n');
    process.exitCode = 2;
  }
}
