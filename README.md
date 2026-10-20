<div align="center">
  <img src="resources/icon.png" alt="CharacterArc" width="88" height="88" />

  # CharacterArc · 弧光

  **本地优先的 AI 小说创作桌面应用**

  <p>
    <img alt="Version" src="https://img.shields.io/badge/version-v1.37.0-f59e0b?style=flat-square" />
    <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" />
  </p>
</div>

围绕章节写作组织的桌面工作台：角色、世界观、大纲与正文存在本机 SQLite，AI 负责初稿、润色与审校。

<p align="center">
  <img src="docs/assets/chapter_creation.png" alt="章节创作" width="100%" />
</p>

## 运行

需 Node.js 22+ 与 pnpm 10+。

```bash
pnpm install
pnpm run dev
```

打包：`pnpm run dist:win` / `pnpm run dist:mac`（需在目标平台执行）。

## 配置 AI

在「设置」中配置，顶栏可随时切换：

- **文本生成** — OpenAI 兼容或 Anthropic 协议，填 Base URL + Key + 模型名
- **Codex CLI** — 复用本机登录状态，无需 Key
- **图像生成** — 最多 8 套渠道全局生效，封面与资产卡共用

Key 以明文存于本机数据库，请勿在共用机器上使用。

项目数据在 `<userData>/data/workspace.db`，不上传第三方服务（AI 请求发往你配置的模型服务）。

[图文教程](https://ecnnfa0ullkb.feishu.cn/wiki/CuMxwE8xwiZyIkkYDDfcdmpjnRe?from=from_copylink) · Electron · Vue 3 · TypeScript

## 许可

[MIT](./LICENSE) © zhouyeshan

Skill 包来自 [oh-story-claudecode](https://github.com/worldwonderer/oh-story-claudecode) 与 [Distilled-Novel-Toolbox](https://github.com/dama-cyber/Distilled-Novel-Toolbox)。
