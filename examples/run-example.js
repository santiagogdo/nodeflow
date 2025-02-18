import { spawn } from 'child_process';
import path from 'path';

const exampleFolderName = process.argv.slice(2)[0] || 'basic';
const filePath = path.join('examples', exampleFolderName);
const child = spawn('vite', [filePath, '--config', 'vite.config.js'], { stdio: 'inherit' });

child.on('error', (err) => {
  console.error('Failed to start child process.', err);
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Child process exited with code ${code}`);
  }
  process.exit(code);
});
