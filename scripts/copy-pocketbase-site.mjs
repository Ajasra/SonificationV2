import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('dist');
const target = path.resolve('pb_public');
if (!fs.existsSync(path.join(source, 'index.html'))) {
  throw new Error('Run the Vite build before copying the site.');
}
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true, force: true });
console.log(`Copied ${source} into ${target}`);
