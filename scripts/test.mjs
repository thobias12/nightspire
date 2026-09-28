import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('.test-build', { recursive: true })
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', 'false', '--module', 'commonjs', '--moduleResolution', 'node', '--outDir', '.test-build'], { stdio: 'inherit' })
writeFileSync('.test-build/package.json', '{"type":"commonjs"}')
execFileSync(process.execPath, ['--test', 'tests/simulation.test.mjs', 'tests/scale.test.mjs', 'tests/road-visuals.test.mjs', 'tests/maps.test.mjs'], { stdio: 'inherit' })
