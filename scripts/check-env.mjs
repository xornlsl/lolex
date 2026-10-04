import { loadEnv } from 'vite'
import { validatePublicEnv } from './public-env.mjs'

const mode = process.argv[2] || 'production'
const errors = validatePublicEnv({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env })
if (errors.length) {
  console.error('Public environment validation failed:\n' + errors.map(e => `- ${e}`).join('\n'))
  process.exitCode = 1
} else {
  console.log('Public environment validated (values not printed).')
}
