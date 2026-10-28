import { createBackendApplication } from './createBackendApplication.js';
import { dataDirectory, frontendBuildDirectory } from './config/applicationPaths.js';
const application = await createBackendApplication({
  dataDirectory,
  frontendDirectory: frontendBuildDirectory,
});
const port = Number(process.env.PORT || 3001);
const server = application.app.listen(port, '127.0.0.1', () =>
  console.log(`Grove RAG Explorer: http://127.0.0.1:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, async () => {
    server.close();
    server.closeAllConnections();
    await application.close();
    process.exit(0);
  });
