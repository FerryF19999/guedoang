import { copyFile, cp, mkdir } from 'node:fs/promises';

const files = [
  'index.html',
  'src/app.js',
  'src/core.js',
  'src/result-card.js',
  'src/style.css',
  'src/feed.css',
  'src/dialog.css',
];

await mkdir('dist/src', { recursive: true });
await Promise.all(files.map(file => copyFile(file, `dist/${file}`)));
await cp('src/assets', 'dist/src/assets', { recursive: true });
console.log('Built Gue Doang? with local artwork and fonts in dist/');
