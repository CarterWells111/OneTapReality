import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const activeDocuments = [
  'AGENTS.md',
  'docs/EXECUTION-CHECKLIST.md',
  '代码规范.md',
];

test('active operating documents identify OneTapReality and avoid retired branding', async () => {
  const documents = await Promise.all(
    activeDocuments.map((path) => readFile(resolve(root, path), 'utf8')),
  );
  const content = documents.join('\n');

  assert.match(content, /OneTapReality/);
  assert.doesNotMatch(content, /CarterWells111\/Tralbum/);
  assert.doesNotMatch(content, /# 旅忆/);
});
