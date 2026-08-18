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

test('decision log defines local recovery drafts for unsaved canvas edits', async () => {
  const decisions = await readFile(resolve(root, 'docs/DECISIONS.md'), 'utf8');
  const heading = '## 2026-08-17：已保存相册的未保存编辑恢复草稿';
  const start = decisions.indexOf(heading);

  assert.notEqual(start, -1);

  const nextHeading = decisions.indexOf('\n## ', start + heading.length);
  const recoveryDecision = decisions.slice(
    start,
    nextHeading === -1 ? undefined : nextHeading,
  );

  assert.match(recoveryDecision, /保存画布.*更新正式相册/);
  assert.match(recoveryDecision, /仅保存在当前设备.*账号隔离.*相册隔离/);
  assert.match(recoveryDecision, /不上传.*不改变正式相册.*不纳入礼品共享快照/);
  assert.match(recoveryDecision, /正式相册版本不匹配.*丢弃恢复草稿/);
});
