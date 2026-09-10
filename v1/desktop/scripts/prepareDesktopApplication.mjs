import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const appDirectory = path.join(root, 'v1/desktop/app');
await mkdir(appDirectory, { recursive: true });
for (const name of ['src', 'backend', 'frontend'])
  await rm(path.join(appDirectory, name), { recursive: true, force: true });
await cp(path.join(root, 'v1/desktop/src'), path.join(appDirectory, 'src'), { recursive: true });
await cp(path.join(root, 'v1/backend/dist'), path.join(appDirectory, 'backend'), {
  recursive: true,
});
await cp(path.join(root, 'v1/frontend/dist'), path.join(appDirectory, 'frontend'), {
  recursive: true,
});
const backendPackage = JSON.parse(
  await readFile(path.join(root, 'v1/backend/package.json'), 'utf8'),
);
const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
const dependencies = Object.fromEntries(
  Object.keys(backendPackage.dependencies).map((name) => [
    name,
    lock.packages['node_modules/' + name].version,
  ]),
);
const manifest = {
  name: 'grove-rag-explorer',
  productName: 'Grove',
  version: '1.1.0',
  description: 'A local RAG knowledge explorer',
  author: 'Grove contributors',
  license: 'UNLICENSED',
  private: true,
  type: 'module',
  main: 'src/startDesktopApplication.cjs',
  dependencies,
  devDependencies: { electron: rootPackage.devDependencies.electron },
  config: { forge: '../forge.config.cjs' },
};
await writeFile(path.join(appDirectory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
const install = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['install', '--include=dev', '--no-audit', '--no-fund'],
  { cwd: appDirectory, stdio: 'inherit' },
);
if (install.status !== 0) process.exit(install.status || 1);
console.log('Desktop application prepared in v1/desktop/app');
