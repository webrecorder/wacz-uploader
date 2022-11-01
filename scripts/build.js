import { build } from 'esbuild'
import { WEB3_STORAGE_TOKEN } from '../config.js'

const isProd = process.env.NODE_ENV === 'production'
const minify = process.argv.includes('--minify')
const watch = process.argv.includes('--watch')

build({
  entryPoints: ['index.js'],
  bundle: true,
  sourcemap: true,
  outfile: 'bundle.js',
  format: 'esm',
  minify: minify || isProd,
  watch: watch,
  define: {
    '__define__.WEB3_STORAGE_TOKEN': JSON.stringify(WEB3_STORAGE_TOKEN || ''),
  },
}).catch(() => process.exit(1))