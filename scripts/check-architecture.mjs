import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve('src/game')
const violations = []
const warnings = []
const runtimeGraph = new Map()
const oversizedLegacy = new Set()

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

function gameRelative(file) {
  return relative(root, file).replaceAll('\\', '/')
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const raw = resolve(dirname(fromFile), specifier)
  const candidates = extname(raw)
    ? [raw]
    : [raw + '.ts', raw + '.tsx', join(raw, 'index.ts'), join(raw, 'index.tsx')]
  return candidates.find(candidate => existsSync(candidate)) ?? null
}

function importIsRuntime(node) {
  const clause = node.importClause
  if (!clause) return true
  if (clause.isTypeOnly) return false
  if (clause.name) return true
  const bindings = clause.namedBindings
  if (!bindings) return true
  if (ts.isNamespaceImport(bindings)) return true
  return bindings.elements.some(element => !element.isTypeOnly)
}

function runtimeImports(source, file) {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const imports = []

  const visit = node => {
    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && importIsRuntime(node)
    ) {
      imports.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return imports
}

const files = walk(root).filter(file => file.endsWith('.ts'))
const fileSet = new Set(files.map(file => resolve(file)))

for (const file of files) {
  const relFile = gameRelative(file)
  const size = statSync(file).size

  if (basename(file) === 'index.ts') {
    violations.push(`${relFile}: barrel index.ts files are forbidden; use direct imports`)
  }
  if (relFile.includes('/simulation/') || relFile.startsWith('simulation/')) {
    violations.push(`${relFile}: legacy simulation junk-drawer path is forbidden`)
  }

  if (size > 80_000) {
    const description = `${relFile} (${Math.round(size / 1024)} KiB)`
    if (oversizedLegacy.has(relFile)) warnings.push(`${description}: tracked legacy hotspot; split when touched`)
    else violations.push(`${description}: module exceeds the 80 KiB navigation budget`)
  }

  const source = readFileSync(file, 'utf8')
  const edges = []
  for (const specifier of runtimeImports(source, file)) {
    const target = resolveImport(file, specifier)
    if (!target || !fileSet.has(resolve(target))) continue

    const targetRel = gameRelative(target)
    edges.push(target)

    if (relFile.startsWith('data/') && !targetRel.startsWith('data/')) {
      violations.push(`${relFile}: data must not runtime-depend on ${targetRel}`)
    }
    if (relFile.startsWith('model/') && targetRel.startsWith('systems/')) {
      violations.push(`${relFile}: model must not runtime-depend on behavior system ${targetRel}`)
    }
    if (relFile.startsWith('model/') && ['app/', 'runtime/', 'ui/', 'render/', 'persistence/', 'qa/'].some(prefix => targetRel.startsWith(prefix))) {
      violations.push(`${relFile}: model must not runtime-depend on higher layer ${targetRel}`)
    }
    if (relFile.startsWith('world/') && ['app/', 'runtime/', 'systems/', 'ui/', 'render/', 'persistence/', 'qa/'].some(prefix => targetRel.startsWith(prefix))) {
      violations.push(`${relFile}: world must not runtime-depend on higher layer ${targetRel}`)
    }
    if (relFile.startsWith('systems/') && ['app/', 'runtime/', 'ui/', 'render/', 'qa/'].some(prefix => targetRel.startsWith(prefix))) {
      violations.push(`${relFile}: gameplay system must not runtime-depend on presentation/orchestration ${targetRel}`)
    }
    if (relFile.startsWith('runtime/') && ['app/', 'ui/', 'render/', 'qa/'].some(prefix => targetRel.startsWith(prefix))) {
      violations.push(`${relFile}: runtime must not runtime-depend on presentation/app ${targetRel}`)
    }
    if (relFile.startsWith('persistence/') && ['app/', 'runtime/', 'ui/', 'render/', 'qa/'].some(prefix => targetRel.startsWith(prefix))) {
      violations.push(`${relFile}: persistence must not runtime-depend on presentation/app ${targetRel}`)
    }
    if (relFile.startsWith('render/') && ['app/', 'ui/', 'runtime/', 'qa/'].some(prefix => targetRel.startsWith(prefix))) {
      violations.push(`${relFile}: renderer must not runtime-depend on app/UI/runtime ${targetRel}`)
    }
  }
  runtimeGraph.set(resolve(file), edges.map(target => resolve(target)))
}

const visiting = new Set()
const visited = new Set()
const stack = []
const reportedCycles = new Set()

function visit(file) {
  if (visited.has(file)) return
  if (visiting.has(file)) {
    const start = stack.indexOf(file)
    const cycle = [...stack.slice(start), file].map(gameRelative)
    const key = cycle.join(' -> ')
    if (!reportedCycles.has(key)) {
      reportedCycles.add(key)
      violations.push('runtime import cycle: ' + key)
    }
    return
  }

  visiting.add(file)
  stack.push(file)
  for (const target of runtimeGraph.get(file) ?? []) visit(target)
  stack.pop()
  visiting.delete(file)
  visited.add(file)
}

for (const file of runtimeGraph.keys()) visit(file)

if (warnings.length) {
  console.log('Architecture warnings:')
  for (const warning of warnings) console.log('  -', warning)
}

if (violations.length) {
  console.error('Architecture violations:')
  for (const violation of violations) console.error('  -', violation)
  process.exit(1)
}

const domains = new Map()
for (const file of files) {
  const domain = gameRelative(file).split('/')[0]
  domains.set(domain, (domains.get(domain) ?? 0) + 1)
}
const domainSummary = [...domains.entries()].sort().map(([name, count]) => `${name}=${count}`).join(', ')
console.log(`Architecture check passed for ${files.length} TypeScript modules; runtime import graph is acyclic.`)
console.log('Module map:', domainSummary)
