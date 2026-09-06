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

test('shared album coordination documents define collaboration and security boundaries', async () => {
  const files = await Promise.all([
    read('docs/NFC-API-COORDINATION.md'),
    read('docs/NFC-HANDOFF.md'),
    read('docs/SECURITY.md'),
    read('docs/release/PRIVACY.md'),
  ]);
  const content = files.join('\n');

  assert.match(content, /viewer.*editor.*邀请/s);
  assert.match(content, /viewer.*editor.*首次.*NFC.*完整.*预览/s);
  assert.match(content, /editor.*完整.*Canvas.*新版本/s);
  assert.match(content, /baseVersion.*409.*gift_album_version_conflict.*重新加载/s);
  assert.match(content, /本地原件不会自动上传/);
  assert.match(content, /editor.*云端共享快照/s);
  assert.match(content, /已有媒体.*服务端.*验证/s);
  assert.match(content, /新媒体.*私有 R2.*临时.*不可变/s);
  assert.match(content, /移除成员.*修改权限.*editor.*申请.*owner.*批准/s);
  assert.match(content, /owner.*直接.*管理/s);
  assert.match(content, /撤销.*停用.*立即拒绝/s);
  assert.match(content, /不保存.*token.*不能证明.*实体.*碰卡/s);
  assert.match(content, /staging.*production.*严格隔离/s);
  assert.match(content, /不新增第三方服务、支付、分析/);
  assert.doesNotMatch(content, /实时协作|自动合并|端到端加密/);
});

test('release privacy states publisher, activation, and deletion lifecycle precisely', async () => {
  const privacy = await read('docs/release/PRIVACY.md');

  assert.match(privacy, /owner 或已激活的 editor.*显式发布.*云端版本/s);
  assert.match(privacy, /不会自动.*上传.*本地原件/s);
  assert.match(privacy, /匹配.*账号.*首次 NFC 激活/s);
  assert.match(privacy, /访问.*共享快照.*立即撤销/s);
  assert.match(privacy, /私有 R2.*维护任务.*异步删除.*失败.*重试/s);
  assert.doesNotMatch(privacy, /只有礼品拥有者.*上传/);
  assert.doesNotMatch(privacy, /停用会删除.*共享快照和媒体/);
});

test('dual iOS staging runbook preserves local Beta data and separates link ownership', async () => {
  const runbook = await read('docs/operations/DUAL-IOS-STAGING-TEST.md');
  for (const required of [
    '不要删除 Beta',
    '更新前',
    '更新后',
    '本地旅行册数量',
    'Beta 独占 staging Universal Link',
    'Development Build 使用手动粘贴',
    '同一套 staging API、PostgreSQL 和私有媒体存储',
    '不复制本地容器',
    '不增加普通旅行册自动云同步',
    '单独批准',
  ]) {
    assert.match(runbook, new RegExp(required, 'u'));
  }
});
