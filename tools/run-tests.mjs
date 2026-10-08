/**
 * 跨平台测试启动器（主进程 / 共享层测试）。
 *
 * 为什么需要它：原来 package.json 里写的是
 *   `set ELECTRON_RUN_AS_NODE=1&& electron --test ...`
 * 这是 cmd 专用语法，在 Git Bash、macOS、Linux 上都会失效，也让 CI 无法直接复用。
 *
 * 这里改为用 Node 统一处理：注入无扩展名导入的解析钩子，把测试文件透传给
 * node:test，并负责选择运行时。
 *
 * 运行时选择：
 *   - 默认使用 Electron（ELECTRON_RUN_AS_NODE=1），与本地历史行为一致；
 *   - 设置 `CHARACTERARC_TEST_RUNTIME=node` 时改用当前 Node 进程，
 *     供 CI 使用——这样无需在流水线里安装 Electron 在 Linux 上依赖的一整套
 *     图形库（libnss3 / libgtk 等），跑起来更快也更不容易坏。
 *     测试本身是纯 Node 测试（只用 node:sqlite、node:test），两种运行时结果一致。
 *
 * 用法：node tools/run-tests.mjs <test-file...>
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const RESOLVER = pathToFileURL(join(REPO_ROOT, 'tools', 'register-ts-resolver.mjs')).href
const usePlainNode = process.env.CHARACTERARC_TEST_RUNTIME === 'node'

const testFiles = process.argv.slice(2)
if (testFiles.length === 0) {
  console.error('[run-tests] 未提供测试文件。用法：node tools/run-tests.mjs <test-file...>')
  process.exit(1)
}

let executable
let env

if (usePlainNode) {
  executable = process.execPath
  env = { ...process.env }
} else {
  const require = createRequire(import.meta.url)
  try {
    // electron 包导出的是其可执行文件的绝对路径
    executable = require('electron')
  } catch (error) {
    console.error('[run-tests] 无法定位 Electron 可执行文件，请先执行 pnpm install。')
    console.error('           也可以设置 CHARACTERARC_TEST_RUNTIME=node 改用当前 Node 运行。')
    console.error(String(error))
    process.exit(1)
  }
  env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
}

const child = spawn(
  executable,
  [
    // file:// URL：Node 的 ESM 加载器在 Windows 上不接受裸绝对路径（C:\...）
    '--import',
    RESOLVER,
    '--test',
    ...testFiles
  ],
  {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env
  }
)

child.on('error', (error) => {
  console.error('[run-tests] 启动测试进程失败：', error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[run-tests] 测试进程被信号 ${signal} 终止。`)
    process.exit(1)
  }
  process.exit(code ?? 1)
})
