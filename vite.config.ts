import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// "Відбиток" коду, від якого залежить синхронізація мережевої гри:
// гравці з різними версіями фізики не зможуть почати матч (інакше гра розійдеться).
const simHash = createHash('sha256')
  .update(readFileSync('src/sim/game.ts'))
  .update(readFileSync('src/net/rollback.ts'))
  .digest('hex')
  .slice(0, 12);

export default defineConfig({
  base: './',
  define: {
    __SIM_HASH__: JSON.stringify(simHash),
  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    target: 'es2020',
  },
});
