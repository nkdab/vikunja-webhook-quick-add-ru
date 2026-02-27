import Fastify from 'fastify';
import { config } from './config.js';
import { vikunjaWebhookRoutes } from './routes/vikunjaWebhook.js';
import { logger } from './utils/logger.js';

async function buildServer() {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    // Disable Fastify's built-in logger in favour of our pino instance
    // by sharing the same pino config; Fastify accepts a logger instance directly.
  });

  // Health check
  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Webhook routes
  await server.register(vikunjaWebhookRoutes);

  return server;
}

async function main(): Promise<void> {
  const server = await buildServer();

  try {
    await server.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ port: config.port }, 'Server started');
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    await server.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
