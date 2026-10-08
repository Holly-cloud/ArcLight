/**
 * 测试入口引导文件：注册无扩展名导入的解析钩子。
 *
 * 用法（与 `node --test` / `electron --test` 组合）：
 *   ELECTRON_RUN_AS_NODE=1 electron --import ./tools/register-ts-resolver.mjs --test <files...>
 *
 * 详见 tools/node-ts-resolver.mjs 的说明。
 */
import { register } from 'node:module'

register('./node-ts-resolver.mjs', import.meta.url)
