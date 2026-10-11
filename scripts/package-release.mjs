import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const freezeHtml = join(root, 'MRC_V2.2.2_沉浸诵读冻结版.html')
const zipOut = join(root, 'pku346-recall-v222-source-and-html.zip')

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', encoding: 'utf8' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('node', ['scripts/verify-package.mjs'])
run('npm', ['run', 'build'])

if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('package-release: dist/index.html missing after build')
  process.exit(1)
}

copyFileSync(join(root, 'dist/index.html'), freezeHtml)
console.log(`Wrote ${freezeHtml}`)

const py = execFileSync('python3', ['scripts/make-release-zip.py', zipOut], { cwd: root, encoding: 'utf8' }).trim()
console.log(`Wrote ${py}`)
run('node', ['scripts/verify-package.mjs'])
