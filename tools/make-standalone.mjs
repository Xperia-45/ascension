// Inlines dist JS+CSS into one self-contained HTML file (ASCENSION_standalone.html).
// Run after `npm run build`:  node tools/make-standalone.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
const js = assets.find((f) => f.endsWith('.js'));
const css = assets.find((f) => f.endsWith('.css'));
const jsCode = readFileSync(join(dist, 'assets', js), 'utf8');
const cssCode = readFileSync(join(dist, 'assets', css), 'utf8');

html = html
  .replace(new RegExp(`<script[^>]*src="[^"]*${js}"[^>]*></script>`), () => `<script type="module">\n${jsCode}\n</script>`)
  .replace(new RegExp(`<link[^>]*href="[^"]*${css}"[^>]*>`), () => `<style>\n${cssCode}\n</style>`);

const out = new URL('../ASCENSION_standalone.html', import.meta.url).pathname;
writeFileSync(out, html);
console.log(`Standalone build written: ${out} (${(html.length / 1024).toFixed(0)} KB)`);
