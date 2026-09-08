import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'dist', 'client')
mkdirSync(dest, { recursive: true })
cpSync(join(root, 'src', 'client', 'index.js'), join(dest, 'index.js'))
console.log('copied client → dist/client/index.js')
