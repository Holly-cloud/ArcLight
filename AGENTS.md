# AGENTS.md

面向在本仓库工作的 AI 编码代理（Agent）的强制规则。与 `CLAUDE.md` 配合使用：`CLAUDE.md` 描述架构，本文件约束工作方式。

---

## 1. 提交规则（强制，不可跳过）

> **任何代码改动完成后，必须立即 `git commit`，不得把改动留在工作区未提交状态。**

### 1.1 提交前必过类型检查

```bash
pnpm run typecheck        # 等价 vue-tsc --noEmit
```

这是本仓库**唯一的静态门禁**（无lint / 无 formatter）。类型错误一律不得提交。`pnpm run build` 会先跑 typecheck，因此发布前必然覆盖。

### 1.2 提交信息

- **中文**，沿用仓库既有前缀风格：`新增` / `修复` / `优化` / `更新` / `发布`
- 事前参考：`git log --oneline -20`
- 示例：
  ```
  新增场景与道具实体并接入关系图谱
  修复章节修改标注范围过大的问题
  优化大纲顺序编排与章节跨卷联动
  ```

### 1.3 一次提交只做一件事

功能、修复、重构、文案、格式化**不要混进同一次提交**。若一个任务天然跨多类改动，拆成多条提交。

### 1.4 分支策略

- 改动前先确认当前分支：`git branch --show-current`
- **不要直接在 `main` 上改动**。先开特性分支：`feat/*`（新功能）、`fix/*`（修复）、`chore/*`（工程杂务）
- 功能完成并验证后再合入 `main`：`git checkout main && git merge <branch>`

### 1.5 git 身份

本仓库**未配置全局 git 身份**。提交前二选一：

```bash
# 方式 A：提示用户配置（一次性，推荐）
git config user.name "Holly"
git config user.email "you@example.com"

# 方式 B：内联身份，不污染全局配置
git -c user.name="<name>" -c user.email="<email>" commit -m "..."
```

若 `git commit` 报 `Please tell me who you are`，按方式 A 或 B 处理，**不要跳过提交**。

### 1.6 禁止事项

- ❌ 未经用户明确要求执行 `git push`
- ❌ 使用 `git commit --amend` 覆盖已有历史
- ❌ 使用 `git reset --hard` 丢弃他人或自己的未提交改动
- ❌ 跳过 hooks（`--no-verify`）

### 1.7 不应提交的内容

| 内容                      | 说明                                        |
| ----------------------- | ----------------------------------------- |
| `node_modules/`         | 依赖目录                                      |
| `dist-electron/`、`out/` | 构建产物（已在 `.gitignore`）                     |
| 临时探针 / 调试日志             | 如 `*-probe-*`、`.qa-scratch/` 等临时目录，验证完应清理 |
| 本地数据与个人配置               | 项目数据目录、`.env`                             |
| **任何密钥、令牌、API Key**     | 含 `.env`、`*_KEY`、`.pem` 等                 |

若改动中确实需要临时产物（如为了验证创建的探针脚本），**验证后先清理再提交**，不要混入提交内容。

---

## 2. 项目约定速查（避免破坏既有设计）

### 2.1 工具链

- 包管理器：`pnpm`（`package.json` 锁定 10.33.2）。若 PATH 中无 `pnpm`，用 `corepack pnpm`
- 全量测试：`pnpm test`（Node 内置 test runner，`*.test.mjs`）
- 已知基线（2026-10-19 复跑）：`pnpm test` 为 **334 tests / 333 pass / 1 fail**，唯一红是 `electron/main/ai/agent/run-agent-codex-cli.test.mjs`（Windows 平台边界，**环境性、不是产品缺陷**）。曾有 5 条既有失败，已在 **v1.32.1** 技术债收尾修到 1 条；判断回归一律与干净基线对比，**不要把这 1 红当回归去"修"**
- **`pnpm test` 是显式文件清单**：新增测试文件必须补进 `package.json` 的 `test`（以及相应的 `test:*`）脚本，否则**不进基线、不会被发现**（历史上出现过孤儿测试）

### 2.2 UI 改动（硬约束）

- **只使用 Naive UI 组件 + lucide-vue-next 图标**，保持与既有面板一致
- **禁止硬编码色值**。统一使用 `--arc-*` 设计令牌（定义在 `renderer/src/styles/global.css` 的 `:root`）
- 暗色模式通过 `.dark-mode` 类覆盖（**不是** `prefers-color-scheme`），新样式需同时适配两种模式
- 滚动容器复用既有 `.arc-scrollbar` 类
- 主题预设见 `renderer/src/theme/presets.ts`（海蓝 / 玉绿 / 琥珀 / 玫红等）

> 若改动涉及 cytoscape 图谱（`features/relations/graph.ts` + `RelationsGraphView.vue`）：cytoscape 只接受字面量颜色，须走 `resolveArcTokenColor()` 运行时读取令牌，并处理无 DOM 回退。

### 2.3 架构红线

- **渲染层不得直接访问文件系统或 AI 服务**，一律经 IPC（`window.characterArc` / `characterarc:*`）
- 新增持久化实体时，以下位置**必须同步改动**，遗漏任一处会导致数据不落盘：
  1. `renderer/src/types/app.ts`（类型）
  2. `electron/shared/ipc-types.ts`（IPC 契约）
  3. `renderer/src/stores/app.ts`（状态与 CRUD）
  4. `electron/main/workspace-store.ts`（建表 / 快照）
  5. `electron/main/workspace-entity-persistence.ts`（增量 upsert / 级联清理）
  6. `renderer/src/features/workspace/persistence.ts`（**白名单合并，遗漏会静默丢数据**）
  7. `renderer/src/features/workspace/storeHelpers.ts`（水合字段透传）
- **向后兼容**：既有工作区数据缺少新字段时，读取必须给默认空值，**不得抛错**
- **级联删除**需双层实现：前端 store 内存层 + 主进程 DB 层

### 2.4 领域逻辑分层

- UI 组件 → `renderer/src/components/`
- 领域逻辑 → `renderer/src/features/<模块名>/`
- 组件写法：`<script setup lang="ts">`，`@/` 别名指向 `renderer/src`，`@shared/*` 指向 `electron/shared`

### 2.5 交付留痕

项目根目录存在发布惯例文件，新增功能时应同步更新：

- `CHANGELOG.md`（变更记录）
- `announcements.json`（应用内公告）
- `tutorial.json`（引导教程）

---

## 3. 完成标准

一次改动在宣布"完成"前，至少满足：

- [ ] `pnpm run typecheck` 零错误
- [ ] 相关测试通过（或明确说明为何不适用）
- [ ] 无硬编码色值等设计约束违例
- [ ] 已 `git commit`，工作区干净
- [ ] 未擅自 `push`、未改写历史
