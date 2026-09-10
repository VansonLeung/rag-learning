import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBackendApplication } from '../backend/createBackendApplication.js';
const directory = path.dirname(fileURLToPath(import.meta.url));
let application;
let server;
try {
  application = await createBackendApplication({
    dataDirectory: process.env.RAG_DATA_DIR,
    frontendDirectory: path.join(directory, '../frontend'),
    desktopToken: process.env.GROVE_DESKTOP_TOKEN,
  });
  server = application.app.listen(0, '127.0.0.1', () =>
    process.parentPort.postMessage({ type: 'ready', port: server.address().port }),
  );
  process.parentPort.on('message', async (event) => {
    if (event.data.type === 'shutdown') {
      server.close();
      server.closeAllConnections();
      await application.close();
      process.exit(0);
    }
  });
} catch (error) {
  process.parentPort.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : 'Startup failed',
  });
  process.exit(1);
}
