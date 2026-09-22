import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/* ENGINE BUILD STAMP — read by src/lib/designfile.js. A saved design records
   which engine produced its numbers, so a later engine can say whether it
   still agrees. `dirty` is true when the build was made from uncommitted
   changes: such a build is not reproducible from the commit alone, and the
   stamp says so instead of passing it off as the commit. */
function buildStamp(mode) {
  const git = (cmd) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return null } }
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  const commit = git('git rev-parse --short=12 HEAD')
  const status = git('git status --porcelain')
  return {
    version: pkg.version,
    commit: commit || 'unknown',
    dirty: status === null ? null : status.length > 0,
    builtAt: new Date().toISOString(),
    /* A dev server computes this once, at start-up, and then serves whatever
       is on disk: its commit goes stale as soon as anything is committed. */
    mode,
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: '/',
  build: {
    minify: true,
    target: 'es2020',
  },
  define: {
    'import.meta.env.VITE_GROQ_KEY': JSON.stringify(process.env.VITE_GROQ_KEY),
    __EVTOL_BUILD__: JSON.stringify(buildStamp(command === "serve" ? "dev-server" : "build")),
  }
}))
