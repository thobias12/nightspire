import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'

const root = resolve('src/game')
const violations = []
const large = []

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

const files = walk(root).filter(file => file.endsWith('.ts'))
for (const file of files) {
  const relFile = relative(process.cwd(), file).replaceAll('\\', '/')
  const size = statSync(file).size
  if (size > 90_000) large.push(`${relFile} (${Math.round(size / 1024)} KiB)`)
  if (relFile.includes('/simulation/')) violations.push(`${relFile}: legacy simulation junk-drawer path is forbidden`)

  const source = readFileSync(file, 'utf8')
  const imports = [...source.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)]
  for (const match of imports) {
    const spec = match[1]
    if (!spec.startsWith('.')) continue
    const target = normalize(resolve(dirname(file), spec))
    const fromRel = relative(root, file).replaceAll('\\', '/')
    const targetRel = relative(root, target).replaceAll('\\', '/')
    if (fromRel.startsWith('model/') && targetRel.startsWith('systems/')) violations.push(`${fromRel}: model must not depend on behavior system ${targetRel}`)
    if (fromRel.startsWith('world/') && targetRel.startsWith('app/')) violations.push(`${fromRel}: world must not depend on app ${targetRel}`)
    if (fromRel.startsWith('systems/') && targetRel.startsWith('app/')) violations.push(`${fromRel}: systems must not depend on app ${targetRel}`)
  }
}

if (large.length) {
  console.log('Large legacy modules to split incrementally:')
  for (const item of large) console.log('  -', item)
}
if (violations.length) {
  console.error('Architecture violations:')
  for (const violation of violations) console.error('  -', violation)
  process.exit(1)
}
console.log(`Architecture check passed for ${files.length} TypeScript modules.`)
