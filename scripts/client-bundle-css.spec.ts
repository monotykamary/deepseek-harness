/**
 * CSS Modules and explicit global styles enter client bundles through virtual
 * modules, so the loader must register each underlying stylesheet as a watch dependency.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { clientBundle } from '../packages/client/tsdown.client.ts'

interface CssPlugin {
  name: string
  resolveId?: (source: string, importer?: string) => string | null
  load?: (this: { addWatchFile(id: string): void }, id: string) => Promise<string | null>
}

function cssPlugin(): CssPlugin {
  const configs = clientBundle(
    '@monotykamary/dsh-client-test',
    ['lib/types/index.js', 'lib/types/invariant.js'],
  )({ env: { DSH_BUILD_FACE: 'client' } })
  const client = configs.find(config => config.platform === 'browser')
  if (client === undefined) throw new Error('client config missing')
  const plugins = (client as { plugins: CssPlugin[] }).plugins
  const plugin = plugins.find(candidate => candidate.name === 'dsh-css-inline')
  if (plugin === undefined) throw new Error('CSS plugin missing from client config')
  return plugin
}

describe('client bundle CSS', () => {
  it('registers the source stylesheet as a watch dependency', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-client-css-watch-'))
    try {
      const stylesheet = join(root, 'Fixture.module.css')
      const importer = join(root, 'index.ts')
      await writeFile(stylesheet, '.root { color: red; }\n')
      const plugin = cssPlugin()
      const virtualId = plugin.resolveId?.('./Fixture.module.css', importer)
      if (typeof virtualId !== 'string' || plugin.load === undefined) {
        throw new Error('CSS Modules plugin hooks are incomplete')
      }
      const watched: string[] = []

      const output = await plugin.load.call({ addWatchFile: id => watched.push(id) }, virtualId)

      expect(watched).toEqual([stylesheet])
      expect(output).toContain('data-plugin-css')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('resolves fontsource CSS and inlines watched WOFF2 assets', async () => {
    const importer = fileURLToPath(new URL('../packages/client/ui-terminal/src/client/index.ts', import.meta.url))
    const plugin = cssPlugin()
    const virtualId = plugin.resolveId?.('@fontsource/fira-code/latin-400.css', importer)
    if (typeof virtualId !== 'string' || plugin.load === undefined) {
      throw new Error('fontsource CSS plugin hooks are incomplete')
    }
    const watched: string[] = []

    const output = await plugin.load.call({ addWatchFile: id => watched.push(id) }, virtualId)

    expect(watched[0]).toMatch(/fira-code[/\\]latin-400\.css$/)
    expect(watched[1]).toMatch(/fira-code[/\\]files[/\\]fira-code-latin-400-normal\.woff2$/)
    expect(output).toContain('data:font/woff2;base64,')
    expect(output).not.toContain("format('woff')")
  })

  it('injects explicit global CSS without exporting hashed class names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-client-global-css-'))
    try {
      const stylesheet = join(root, 'Fixture.global.css')
      const importer = join(root, 'index.ts')
      await writeFile(stylesheet, '.xterm { color: red; }\n')
      const plugin = cssPlugin()
      const virtualId = plugin.resolveId?.('./Fixture.global.css', importer)
      if (typeof virtualId !== 'string' || plugin.load === undefined) {
        throw new Error('global CSS plugin hooks are incomplete')
      }
      const watched: string[] = []

      const output = await plugin.load.call({ addWatchFile: id => watched.push(id) }, virtualId)

      expect(watched).toEqual([stylesheet])
      expect(output).toContain('.xterm')
      expect(output).toContain('export default {}')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
