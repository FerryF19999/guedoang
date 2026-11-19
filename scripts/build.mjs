import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist/src',{recursive:true});for(const f of ['index.html','src/style.css','src/core.js','src/app.js','src/result-card.js'])await copyFile(f,`dist/${f}`);console.log('Built 5 static files → dist (zero runtime dependencies)');
