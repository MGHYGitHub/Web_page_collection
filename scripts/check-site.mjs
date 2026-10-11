import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignored = new Set(['.git', '.codex', '.agents', 'node_modules']);
const authoredScripts = ['portal.js', 'links.js', '工时/holiday-settings.js', '工时/holiday-config.js', '站点监控/monitor.js', '在线计时器/timer.js'];
const issues = [];
const checkedStyles = new Set();
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (ignored.has(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : file.endsWith('.html') ? [file] : [];
  });
}
function compile(source, filename) {
  try { new vm.Script(source, { filename }); }
  catch (error) { issues.push(`${filename}: ${error.message}`); }
}
function checkReference(value, file) {
  if (!value || /^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(value) || /[${}]/.test(value)) return;
  const pathname = value.split(/[?#]/)[0];
  if (!pathname || pathname.startsWith('/')) return; // Deployment prefixes depend on the static host.
  try {
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(pathname));
    if (!fs.existsSync(resolved)) issues.push(`${path.relative(root, file)}: missing ${value}`);
    else if (resolved.endsWith('.css') && !checkedStyles.has(resolved)) {
      checkedStyles.add(resolved);
      const css = fs.readFileSync(resolved, 'utf8');
      for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) checkReference(match[2].trim(), resolved);
    }
  } catch { issues.push(`${path.relative(root, file)}: invalid resource path ${value}`); }
}
const pages = walk(root);
let inlineCount = 0;
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  if (!/<meta\s+[^>]*name=["']viewport["']/i.test(html)) issues.push(`${path.relative(root, file)}: missing viewport`);
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(match[1]) || /\btype=["'](?:application\/json|application\/ld\+json|importmap|text\/plain)["']/i.test(match[1])) continue;
    compile(match[2], `${path.relative(root, file)}:inline-${++inlineCount}`);
  }
  // Inspect actual tags, excluding templates embedded in JavaScript.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => tag.slice(0, tag.indexOf('>') + 1)).replace(/<!--[\s\S]*?-->/g, '');
  const ids = new Set();
  for (const match of markup.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
    if (ids.has(match[1])) issues.push(`${path.relative(root, file)}: duplicate id ${match[1]}`);
    ids.add(match[1]);
  }
  for (const match of markup.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) checkReference(match[1], file);
}
for (const file of authoredScripts) compile(fs.readFileSync(path.join(root, file), 'utf8'), file);
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
else console.log(`PASS: ${pages.length} pages, ${inlineCount} inline scripts, ${authoredScripts.length} authored JS files; unique IDs and HTML/CSS local resource paths resolved.`);
