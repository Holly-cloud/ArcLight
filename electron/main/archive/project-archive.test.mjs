import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import JSZip from 'jszip'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@shared/')) {
      return nextResolve(new URL(`../../shared/${specifier.slice(8)}.ts`, import.meta.url).href, context)
    }
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(candidate)) return nextResolve(candidate.href, context)
    }
    return nextResolve(specifier, context)
  }
})

const { importProjectArchive } = await import('./project-archive.ts')

for (const { name, premise, modules, expected } of [
  { name: '覆盖项目资料时更新独立简介', premise: '归档简介', modules: ['project'], expected: '归档简介' },
  { name: '覆盖项目资料时保留主动清空的简介', premise: '', modules: ['project'], expected: '' },
  { name: '旧归档覆盖项目资料时移除目标项目简介以允许兼容恢复', premise: undefined, modules: ['project'], expected: undefined },
  { name: '未选择项目资料模块时保留目标简介', premise: '归档简介', modules: ['worldview'], expected: '目标简介' }
]) {
  test(name, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'characterarc-premise-archive-'))
    try {
      const zip = new JSZip()
      zip.file('manifest.json', JSON.stringify({ app: 'CharacterArc', archiveVersion: '1.0' }))
      zip.file('project.json', JSON.stringify({ id: 'source', title: '归档项目', premise }))
      const filePath = join(directory, 'project.carc')
      await writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }))

      const snapshot = {
        selectedProjectId: 'target',
        projects: [{ id: 'target', title: '目标项目', premise: '目标简介' }],
        workspaces: { target: { chapters: [], aiRuns: [] } },
        knowledgeDocuments: []
      }
      let saved
      await importProjectArchive({
        db: {},
        filePath,
        mode: 'overwrite-project',
        targetProjectId: 'target',
        modules,
        readWorkspaceSnapshot: () => snapshot,
        writeWorkspaceSnapshot: (_db, payload) => { saved = payload }
      })

      assert.equal(saved.projects[0].premise, expected)
      assert.equal(saved.projects[0].title, modules.includes('project') ? '归档项目' : '目标项目')
      assert.equal(snapshot.projects[0].premise, '目标简介')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}

// 2026-10-21 更名为「织星 Clytie」：新归档写 app='Clytie'，
// 但用户存量归档仍是更名前的 app='CharacterArc'，两者都必须能导入。
for (const appId of ['Clytie', 'CharacterArc']) {
  test(`归档 manifest 的 app 标识 '${appId}' 均可导入`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'clytie-appid-archive-'))
    try {
      const zip = new JSZip()
      zip.file('manifest.json', JSON.stringify({ app: appId, archiveVersion: '1.0' }))
      zip.file('project.json', JSON.stringify({ id: 'source', title: '归档项目', premise: '归档简介' }))
      const filePath = join(directory, 'project.carc')
      await writeFile(filePath, await zip.generateAsync({ type: 'nodebuffer' }))

      let saved
      await importProjectArchive({
        db: {},
        filePath,
        mode: 'overwrite-project',
        targetProjectId: 'target',
        modules: ['project'],
        readWorkspaceSnapshot: () => ({
          selectedProjectId: 'target',
          projects: [{ id: 'target', title: '目标项目', premise: '目标简介' }],
          workspaces: { target: { chapters: [], aiRuns: [] } },
          knowledgeDocuments: []
        }),
        writeWorkspaceSnapshot: (_db, payload) => { saved = payload }
      })

      assert.equal(saved.projects[0].premise, '归档简介')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}
