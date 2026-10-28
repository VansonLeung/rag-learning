import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const processHandle = spawn(
  require('electron'),
  [fileURLToPath(new URL('../app', import.meta.url))],
  { env: environment, stdio: 'inherit' },
);
processHandle.on('exit', (code) => process.exit(code ?? 1));
