import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { startScheduler } from './services/recurring';

const app = createApp();
const server = app.listen(env.PORT, () => console.log(JSON.stringify({ level: 'info', msg: `Mela Sales API on :${env.PORT}` })));
if (env.ENABLE_SCHEDULER) startScheduler(env.SCHEDULER_INTERVAL_SECONDS);

const shutdown = () => {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
