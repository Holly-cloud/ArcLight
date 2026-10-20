# 项目命名方案

> 2026-10-20 · 基于 v1.37.0 实际形态与已拍板定位（Q2：仍锚定「资产卡管理」）推导

---

## 一、命名依据

命名不能凭喜好定，要对上项目现在的真实内核：

| 依据 | 事实 | 对命名的要求 |
|---|---|---|
| 定位锚点 | Q2 已拍板**仍锚定「资产卡管理」**，写作主线（L6）仅为旁支 | 名字应指向**沉淀 / 归档 / 检索**，而非单纯「写作」 |
| 核心抽象 | 4 类资产卡：角色 / 道具 / 场景 / 组织（`assetLibraryModel.ts`） | 名字需容纳「多种设定实体」 |
| 差异化能力 | 视觉一致性（palette / 材质 / 光影 / 季相）+ 资产卡生图 | 「设定资产」的语感优于「文字编辑器」 |
| 领域惯例 | 叙事类工具惯用 *Codex / Grimoire / Folio / Ledger / Bestiary* | 拉丁-古典词根更贴专业工具的气质 |
| 技术现实 | 纯本地 SQLite，无云同步、无团队协同 | 名字不承诺「协作 / 云 / 社区」 |

### 硬约束：命名空间必须干净

已实测排除（GitHub 仓库名 / npm / PyPI 任一占用即出局）：

`CharacterArc`（当前名，且与上游 character-arc 撞车）· `StoryForge` · `Inkwell` · `LoreCraft` · `Chronicle` · `Mythos` · `ArcForge` · `Atlas` · `StoryVault` · `ArcNest` · `FabricA` · `TomeKeeper` · `LoreForge` · `ArcVault` · `StoryAtlas` · `TaleSmith` · `InkForge`

> 叙事类工具的常用词几乎已被占满 → 必须造**组合词**，或用较少人用的词根。

---

## 二、推荐方案

### 🥇 Tellarca ／ 提尔弧

```
Tel  ·  讲述者、说书人（Teller / Telos）
Arc  ·  弧、故事弧（Arc）
```

| 维度 | 评价 |
|---|---|
| 语义 | 讲述者之弧 —— 讲的人在推进中成型，与「角色弧 + 资产沉淀」双关 |
| 读音 | /ˈtel.ɑːk/，三音节，中英文都好念 |
| 占用 | GitHub **0** · npm 空闲 · PyPI 空闲 · **.com 域名可注册** |
| 中文名 | **提尔弧**（音义兼顾：提 = 提取/沉淀，弧 = 弧光血脉） |
| 优点 | 命名空间最干净，域名可注册；保留「弧」字承接「弧光」既有品牌资产 |
| 风险 | 含义需一次解释；纯英文用户初次接触不知做什么 |

### 🥈 Plotledger ／ 情节账本

```
Plot    ·  情节（Plot）
Ledger  ·  账本、分类记录（Ledger）
```

| 维度 | 评价 |
|---|---|
| 语义 | **直接命中「资产卡即账目条目」** —— 角色/道具/场景都是账上的一笔 |
| 占用 | GitHub 1（地块情报平台，**异领域不冲突**）· npm 空闲 · PyPI 空闲 · .com 已注册 |
| 中文名 | **情节账本** |
| 优点 | 五个候选中**最贴产品内核**；账本隐含「可检索、可对账、可盘点」，正是资产库的交互本质 |
| 风险 | Ledger 偏金融味；.com 被占（.dev / .app / .io 多为可取） |

### 🥉 Loreindex ／ 设定索引

```
Lore    ·  世界设定、传说（Lore）
Index   ·  索引、目录（Index）
```

| 维度 | 评价 |
|---|---|
| 语义 | 设定索引 —— 角色/道具/场景/组织的可检索档案表 |
| 占用 | GitHub **0** · npm 空闲 · PyPI 空闲 · .com 已注册 |
| 中文名 | **设定索引** |
| 优点 | 语义精确描述资产库；Index 一词直接点出「检索」价值；专业感强 |
| 风险 | 略冷、略技术；「索引」听起来像工具而非创作产品 |

### 备选

| 名称 | 中文 | 占用 | 适用场景 |
|---|---|---|---|
| **Arcfolio** | 弧光档案 | GitHub 10（均冷门）· npm 空闲 | 想**保留「弧光」品牌连续性**时首选：Arc + Folio（档案册） |
| **Inkledger** | 墨账 | GitHub 5 · npm 空闲 | 想强调**文学气质**时首选，但语义最抽象 |
| **Arcarium** | 弧境 | GitHub 2 · npm 空闲 | 偏世界观方向 |

---

## 三、最终建议

**采用 `Tellarca ／ 提尔弧`**，理由按权重排序：

1. **命名空间完全干净** —— 五个候选里唯一 .com 域名可注册的，GitHub 零同名，npm/PyPI 全空闲。命名不是一步到位的事，**留出干净的长期空间比当下语感更值钱**。
2. **「弧」字承接既有品牌资产** —— 项目已叫「弧光」十来个版本，AGENTS.md / CHANGELOG / 教程 / 用户认知里都沉淀了这个字。`Tellarca` 是**换壳不换骨**，改造成本与用户认知迁移成本最低。
3. **语义双关到位** —— Tel（讲述者）与 Arc（弧）同时覆盖「角色弧」和「叙事弧」，与资产卡管理不冲突。
4. **次选 `Plotledger`** —— 如果更看重「一眼看出产品做什么」而非命名空间洁净度，Plotledger 的语义命中度最高，且唯一同名者在异领域。

**不建议**继续用 CharacterArc：它与上游开源项目 `uu201/character-arc` 同名，本仓库是其衍生复刻，**沿用会造成来源混淆**（尤其是这仓库已经是公开的 ArcLight）。同时 `CharacterArc` 字面只讲「角色」，而产品早已扩到道具/场景/组织/世界观，名字已经跟不上产品。

---

## 四、改名执行清单（若采用 Tellarca）

| # | 位置 | 现状 | 目标 |
|---|---|---|---|
| 1 | `package.json` | `"name": "characterarc"` / `"productName": "CharacterArc"` / `"appId": "com.characterarc.desktop"` | `tellarca` / `Tellarca` / `com.tellarca.desktop` |
| 2 | 渲染层常量 | `renderer/src/App.vue:28` `appName = '弧光'` | `'提尔弧'` |
| 3 | 托盘与窗口 | `electron/main/window-manager.ts:124,127,132` 三处「弧光」 | 「提尔弧」 |
| 4 | 教程标题 | `renderer/src/features/tutorials/tutorials.ts:9` | 同步更名 |
| 5 | 图标 alt / 项目名兜底 | `GlobalAssistantPage.vue:280` `alt="CharacterArc"`；`OutlinePanel.vue:1458` `?? 'CharacterArc'` | 同步更名（**仅这 2 处用户可见**） |
| 6 | README | 标题 / 图文教程链接文案 | 同步更名 |
| 7 | 产物名 | `artifactName` 用 `${productName}` 变量 | **自动跟随，无需改** |
| 8 | 图标与资源 | `resources/icon.png` 等 | 视觉重制（可选，不阻塞） |

### ⚠️ 不要改的部分

`CharacterArc` 在代码里共出现于 **81 个文件**，但绝大多数是**内部标识符**，与用户无关：

| 类别 | 规模 | 改否 |
|---|---|---|
| `window.characterArc` IPC 桥接名 | **160 处 / 44 文件** | ❌ **不改**（改则动全部 IPC 契约，收益低风险高） |
| `CharacterArc*` 类型名前缀（`CharacterArcAiStreamEvent`、`CharacterArcProjectArchive*`…） | 27 文件 | ❌ 不改（纯 TS 类型名） |
| 用户可见字面 | **仅 2 处**（上表 #5） | ✅ 改 |

**结论：只改对外品牌，产品名 / 窗口标题 / 托盘 / README / 教程 / 2 处可见字面。**
若确要全量改内部名，`window.characterArc` → `window.tellarca` 应作为**独立一次提交**，用 `replace_all` 逐文件核验，并跑 `pnpm test` 全量（当前基线 357/356/1）。

**数据零影响**：数据库、schema、IPC 通道名均不依赖产品名，**无需 schema 迁移**。

⚠️ **但工作区目录会变**：代码里没有 `app.setName()`，Electron 的 `app.getPath('userData')` 取自 **`package.json` 的 `name` 字段**（当前 `characterarc`）→ 目录为 `~/AppData/Roaming/characterarc`。改 `name` 后会指向 `.../tellarca`，**旧数据需用户自行复制**。

**两个选项**：
- **A（推荐）**：改 `productName` / `appId` / 品牌字面，**`name` 字段保持 `characterarc` 不动** → 数据目录不变，零迁移成本。缺点是包名与产品名不一致（仅内部可见）。
- **B**：连 `name` 一起改 → 目录变更，引导用户用**应用内工作区导出/导入**迁移（能力已具备），或直接手动复制 `~/AppData/Roaming/characterarc/data/workspace.db`。

---

## 五、备查：已排除的候选及原因

| 候选 | 排除原因 |
|---|---|
| CharacterArc | 与上游开源仓库同名（来源混淆）；字面只讲角色，已落后于产品 |
| StoryForge | npm 已占（0.18.1） |
| Inkwell | npm 已占 + GitHub 多同名 |
| LoreCraft / LoreForge | GitHub / npm 均占 |
| Chronicle / Mythos | npm / PyPI 已占，且过于宏大不切题 |
| ArcForge / ArcCraft | GitHub 多同名 |
| Atlas | GitHub 大量同名 |
| FabricA | npm 已占 |
| TomeKeeper / StoryVault / ArcNest | GitHub 5 个同名 |
| 保留「弧光」中文但英文新名 | 中英割裂会推高认知成本 |
