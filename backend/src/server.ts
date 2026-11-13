import { createApp } from './app';
import { env } from './lib/env';
import { prisma } from './lib/prisma';

const app = createApp();
const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`PO System API berjalan di http://${env.HOST}:${env.PORT}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
