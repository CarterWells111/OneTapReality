import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFile(resolve(root, path), 'utf8');
const templates = [
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/ISSUE_TEMPLATE/operations.yml',
  '.github/ISSUE_TEMPLATE/nfc-card-batch.yml',
  '.github/ISSUE_TEMPLATE/p0-incident.yml',
];

test('coordination templates capture ownership, environment, evidence, and safe records', async () => {
  const files = await Promise.all(templates.map(read));
  for (const file of files) {
    assert.match(file, /id: owner/);
    assert.match(file, /id: environment/);
    assert.match(file, /id: acceptance/);
    assert.match(file, /请勿填写.*(secret|token|验证码)/);
  }

  const operations = await read('.github/ISSUE_TEMPLATE/operations.yml');
  assert.match(operations, /id: approver/);
  assert.match(operations, /id: rollback/);

  const nfc = await read('.github/ISSUE_TEMPLATE/nfc-card-batch.yml');
  assert.match(nfc, /id: card_batch/);
  assert.match(nfc, /完整.*URL.*token/);

  const incident = await read('.github/ISSUE_TEMPLATE/p0-incident.yml');
  assert.match(incident, /GIFT_SHARING_ENABLED=false/);
  assert.match(incident, /id: recovery_approval/);
});

test('coordination guidance names OneTapReality and rejects secret examples', async () => {
  const files = await Promise.all([
    read('.github/PULL_REQUEST_TEMPLATE.md'),
    read('docs/operations/TEAM-COORDINATION.md'),
    read('docs/operations/DEPLOYMENT-LOG.md'),
    read('docs/operations/NFC-CARD-BATCH-LOG.md'),
  ]);
  const content = files.join('\n');
  assert.match(content, /OneTapReality/);
  assert.match(content, /不得记录/);
  assert.doesNotMatch(content, /gho_[A-Za-z0-9]+/);
});
