import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['src/client/docx-import.js'],
  outfile: 'public/js/docx-import.js',
  bundle: true, platform: 'browser', format: 'esm', target: 'es2022', minify: true,
  legalComments: 'eof',
});
