/**
 * Web application entry: thin bootstrap over the shell library. Everything —
 * module-table seeding, the boot page, and the UI-renderer handoff — lives
 * in @monotykamary/dsh-client-web; this file only finds the mount point.
 */
import './tailwind.css'
import { AppWebEntry } from '@monotykamary/dsh-client-web'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
void new AppWebEntry(el).run()
