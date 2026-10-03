import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
rmSync('.test-build', { recursive: true, force: true })
mkdirSync('.test-build', { recursive: true })
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', 'false', '--module', 'commonjs', '--moduleResolution', 'node', '--outDir', '.test-build'], { stdio: 'inherit' })
writeFileSync('.test-build/package.json', '{"type":"commonjs"}')
execFileSync(process.execPath, ['--test', 'tests/simulation.test.mjs', 'tests/scale.test.mjs', 'tests/road-visuals.test.mjs', 'tests/maps.test.mjs', 'tests/map-setup.test.mjs', 'tests/planning.test.mjs', 'tests/hud.test.mjs', 'tests/manuscript-art.test.mjs', 'tests/village-visuals.test.mjs', 'tests/grounded-models.test.mjs'], { stdio: 'inherit' })
