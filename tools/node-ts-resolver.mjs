/**
 * 测试期模块解析钩子。
 *
 * 背景：源码里大量使用两类"打包器写法"，它们对 Vite/rollup 与
 * tsconfig（`moduleResolution: Bundler`）是合法的，但 `node --test` 直接加载
 * `.ts` 源码时走的是 Node 原生 ESM 解析，无法识别：
 *
 *   1. 无扩展名的相对导入 —— `from './proxy-fetch'`、`from '../skills'`
 *   2. 路径别名          —— `from '@shared/ai-provider-catalog'`、`from '@/features/x'`
 *
 * 这里在不改动任何业务源码的前提下，给测试运行器补上这两项能力：
 *
 *   - `./foo`          → `./foo.ts` / `./foo/index.ts` / ...（逐个候选探测）
 *   - `@shared/foo`    → `<root>/electron/shared/foo{.ts|/index.ts|...}`
 *   - `@/foo`          → `<root>/renderer/src/foo{.ts|/index.ts|...}`
 *
 * 别名映射必须与 tsconfig.json / electron.vite.config.ts 保持一致；三处任一
 * 变更都要同步，否则测试会以"模块找不到"的形式失败。
 *
 * 其他裸模块名（`node:` 前缀、`@node-rs/*`、`@vueuse/*` 等依赖）一律交回默认
 * 解析，避免影响 node_modules 加载。
 */

import { dirname, resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** 本文件位于 <root>/tools/，因此仓库根目录是上一级 */
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/** 与 tsconfig.json#paths 保持一致 */
const PATH_ALIASES = [
  { prefix: '@shared/', target: resolvePath(REPO_ROOT, 'electron/shared') },
  { prefix: '@/', target: resolvePath(REPO_ROOT, 'renderer/src') }
]

const CANDIDATE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.json']

/** 末段已带扩展名（含 .ts / .json / .vue 等）时视为书写完整，不再探测 */
const HAS_EXTENSION = /\.[A-Za-z0-9]+$/

function isPathSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')
}

/** 把 `@shared/x` / `@/x` 还原为绝对路径，其余返回 null */
function resolveAlias(specifier) {
  for (const { prefix, target } of PATH_ALIASES) {
    if (specifier.startsWith(prefix)) {
      return resolvePath(target, specifier.slice(prefix.length))
    }
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  const aliased = resolveAlias(specifier)
  const isPath = isPathSpecifier(specifier)

  // 非路径、非别名（如 node:fs、@node-rs/jieba）→ 默认解析
  if (!aliased && !isPath) {
    return nextResolve(specifier, context)
  }

  // 已带扩展名 → 直接交给默认解析（别名需先转成 file URL 才能被解析）
  if (HAS_EXTENSION.test(aliased ?? specifier)) {
    return nextResolve(aliased ? pathToFileURL(aliased).href : specifier, context)
  }

  const bases = aliased
    ? [pathToFileURL(aliased).href]
    : [specifier]

  for (const base of bases) {
    for (const extension of CANDIDATE_EXTENSIONS) {
      for (const candidate of [`${base}${extension}`, `${base}/index${extension}`]) {
        try {
          return await nextResolve(candidate, context)
        } catch {
          // 该候选不存在，继续尝试下一个
        }
      }
    }
  }

  // 全部候选失败：交回默认解析，让 Node 给出原始、可读的错误信息
  return nextResolve(specifier, context)
}
