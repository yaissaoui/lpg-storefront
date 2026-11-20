/* eslint-disable no-console */
// Copies the @dropins/* packages listed in "dependencies" from node_modules to
// scripts/__dropins__, where the browser loads them through the import map in
// head.html. Adapted from the Adobe commerce boilerplate postinstall.js (ES module
// here because package.json sets "type": "module"). The copied code is never
// edited by hand: rerun `npm run install:dropins` after a version change.
import fs from 'node:fs';
import path from 'node:path';

const { dependencies } = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const packageLock = JSON.parse(fs.readFileSync('./package-lock.json', 'utf8'));
const dropinsDir = path.join('scripts', '__dropins__');
const source = path.join('node_modules', '@dropins');

fs.rmSync(dropinsDir, { recursive: true, force: true });
fs.mkdirSync(dropinsDir, { recursive: true });

const entries = fs.readdirSync(source, { withFileTypes: true })
  .filter((e) => e.isDirectory() && dependencies[`@dropins/${e.name}`]);

// A stale node_modules would ship the wrong code. Stop when it differs from the lock file.
const mismatches = entries.map((e) => {
  const name = `@dropins/${e.name}`;
  const { version } = JSON.parse(fs.readFileSync(path.join(source, e.name, 'package.json'), 'utf8'));
  const expected = packageLock.packages[`node_modules/${name}`]?.version;
  return expected && expected !== version ? `${name}: installed ${version}, expected ${expected}` : null;
}).filter(Boolean);

if (mismatches.length) {
  console.error('Drop-in version mismatch with package-lock.json:');
  mismatches.forEach((m) => console.error(`  ${m}`));
  console.error('Run "rm -rf node_modules && npm ci" first.');
  process.exit(1);
}

entries.forEach((e) => {
  fs.cpSync(path.join(source, e.name), path.join(dropinsDir, e.name), {
    recursive: true,
    filter: (src) => !src.endsWith('package.json'),
  });
});

const hlxignore = fs.existsSync('.hlxignore') ? fs.readFileSync('.hlxignore', 'utf8') : '';
if (!hlxignore.includes('*.map')) {
  console.info('Warning: add "*.map" to .hlxignore so source maps are not served.');
}

const artifactory = Object.entries(packageLock.packages)
  .filter(([, info]) => info.resolved?.includes('artifactory'))
  .map(([name]) => name);
if (artifactory.length) {
  console.error(`Artifactory URLs in package-lock.json: ${artifactory.join(', ')}`);
  process.exit(1);
}

console.info(`Drop-ins copied to ${dropinsDir}: ${entries.map((e) => e.name).join(', ')}`);
