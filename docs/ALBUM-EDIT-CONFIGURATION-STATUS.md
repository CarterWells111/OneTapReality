# 相册编辑改进状态

- 目标已实现：照片与模板按剩余容量多选追加；当前页模板槽位前后移动及编号预览；单按钮“再次编辑全部页面”进入逐页模板、顺序和实时预览配置。
- 基线：origin/main 7a49ba4（PR #97）。整合分支：codex/album-edit-multiselect。
- 分工提交：任务 A cba82f3；任务 B 3baded3；本任务完成 cherry-pick、代码复核和 SDK 57 样式兼容修复。
- 范围：整册配置固定现有页数和照片归属，不跨页重分配；保留页面身份、照片裁剪、文字/装饰/背景/封面，取消不应用，统一应用可一次撤销，未应用配置阻止正式保存。
- 验证：npm ci 成功；main 基线 lint/typecheck/test:ci 通过。整合后 lint/typecheck 通过；test:ci 229 个 Jest 套件、1794 项通过、1 项原有跳过，以及 29 项 Node 检查通过；SDK 样式修复后另跑 photo-layout-sheet 19 项通过。git diff --check 通过。
- 限制：未做 iPhone 真机视觉/系统照片选择器验证；无依赖、路由或生产构建变更，未运行 build:server；未推送、部署或发布。
- 原始工作目录的未提交修改保持不动。
