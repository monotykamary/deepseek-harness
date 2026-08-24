import { pathToFileURL } from 'node:url'
import { Context } from '@monotykamary/cordis'
import Hmr from '@monotykamary/cordis-plugin-hmr'
import Loader from '@monotykamary/cordis-plugin-loader'
import Timer from '@monotykamary/cordis-plugin-timer'

/** Boot the real HMR plugin against a temporary filesystem root. */
export async function bootHmr(dir: string, root: string[] = [], usePolling?: boolean): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader)
  await ctx.plugin(Timer)
  await ctx.plugin(Hmr, {
    root,
    ignored: [],
    debounce: 0,
    ...usePolling === undefined ? {} : { usePolling },
  })
  return ctx
}

/** Wait for an operating-system observation and fail with its owning diagnostic. */
export async function eventually(test: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!test()) {
    if (Date.now() >= deadline) throw new Error(message)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
