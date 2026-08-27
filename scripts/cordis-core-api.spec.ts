/** Tests for the generated Cordis core API reference. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  renderCordisCoreApiPage,
  type CordisCoreApiPage,
} from './cordis-core-api.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Cordis core API generation', () => {
  it('rejects a public core class without source JSDoc', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-cordis-core-api-'))
    roots.push(root)
    mkdirSync(join(root, 'vendor/cordis/src'), { recursive: true })
    writeFileSync(join(root, 'vendor/cordis/src/service.ts'), 'export class Service {\n  run(): string { return "ok" }\n}\n')
    const page: CordisCoreApiPage = {
      out: 'docs/cordis-api/service.md',
      title: 'Service',
      intro: 'Service API.',
      sections: [{ kind: 'class', file: 'vendor/cordis/src/service.ts', symbol: 'Service' }],
    }
    expect(() => renderCordisCoreApiPage(page, root)).toThrow('class Service')
  })
})
