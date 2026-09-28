import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(git('rev-parse', 'HEAD')),
    __BUILD_DIRTY__: JSON.stringify(Boolean(git('status', '--porcelain'))),
  },
})
