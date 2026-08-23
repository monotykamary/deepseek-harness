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

function cssPlugin(name: 'dsh-css-inline' | 'dsh-css-global-inline' | 'dsh-css-text-inline'): CssPlugin {
  const configs = clientBundle(
    '@monotykamary/dsh-client-test',
    ['lib/types/index.js', 'lib/types/invariant.js'],
  )({ env: { DSH_BUILD_FACE: 'client' } })
  const client = configs.find(config => config.platform === 'browser')
  if (client === undefined) throw new Error('client config missing')
  const plugins = (client as { plugins: CssPlugin[] }).plugins
  const plugin = plugins.find(candidate => candidate.name === name)
  if (plugin === undefined) throw new Error(`${name} missing from client config`)
  return plugin
}

async function loadCss(
  name: 'dsh-css-inline' | 'dsh-css-global-inline' | 'dsh-css-text-inline',
  source: string,
  importer: string,
): Promise<{ output: string; watched: string[] }> {
  const plugin = cssPlugin(name)
  const virtualId = plugin.resolveId?.(source, importer)
  if (typeof virtualId !== 'string' || plugin.load === undefined) {
    throw new Error(`${name} plugin hooks are incomplete`)
  }
  const watched: string[] = []
  const output = await plugin.load.call({ addWatchFile: id => watched.push(id) }, virtualId)
  if (output === null) throw new Error(`${name} returned no CSS module`)
  return { output, watched }
}

describe('client bundle CSS', () => {
  it('registers the source stylesheet as a watch dependency', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-client-css-watch-'))
    try {
      const stylesheet = join(root, 'Fixture.module.css')
      const importer = join(root, 'index.ts')
      await writeFile(stylesheet, '.root { color: red; }\n')
      const { output, watched } = await loadCss('dsh-css-inline', './Fixture.module.css', importer)

      expect(watched).toEqual([stylesheet])
      expect(output).toContain('data-plugin-css')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('resolves fontsource CSS and inlines watched WOFF2 assets', async () => {
    const importer = fileURLToPath(new URL('../packages/client/ui-terminal/src/client/index.ts', import.meta.url))
    const plugin = cssPlugin('dsh-css-inline')
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
      const { output, watched } = await loadCss('dsh-css-global-inline', './Fixture.global.css', importer)

      expect(watched).toEqual([stylesheet])
      expect(output).toContain('.xterm')
      expect(output).toContain('export default {}')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('client bundle global CSS', () => {
  it('compiles a side-effect stylesheet into a watched style injector', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-client-global-css-watch-'))
    try {
      const stylesheet = join(root, 'base.css')
      const importer = join(root, 'index.ts')
      await writeFile(stylesheet, 'body { color: red; }\n')
      const { output, watched } = await loadCss('dsh-css-global-inline', './base.css', importer)

      expect(watched).toEqual([stylesheet])
      expect(output).toContain('data-plugin-css')
      expect(output).toContain('body{color:red}')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('compiles inline stylesheets as watched text without a module side effect', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-client-inline-css-watch-'))
    try {
      const stylesheet = join(root, 'base.css')
      const importer = join(root, 'index.ts')
      await writeFile(stylesheet, 'body { color: red; }\n')
      const { output, watched } = await loadCss('dsh-css-text-inline', './base.css?inline', importer)

      expect(watched).toEqual([stylesheet])
      expect(output).toContain('export default "body{color:red}"')
      expect(output).not.toContain('data-plugin-css')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
