# 协作指南

提交应小而聚焦，并采用 Conventional Commit 风格，例如 `feat: save local memories`。

提交前必须运行：

```bash
npm run lint
npm run typecheck
npm run test:ci
```

涉及产品、隐私、依赖或数据结构的改变，先在 `docs/DECISIONS.md` 记录原因和影响。不得提交 `.env`、密钥、个人照片或 Expo 本地状态目录。

