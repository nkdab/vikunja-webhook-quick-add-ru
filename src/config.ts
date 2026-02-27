import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  vikunja: {
    baseUrl: requireEnv('VIKUNJA_BASE_URL'),
    token: requireEnv('VIKUNJA_TOKEN'),
  },
  http: {
    timeoutMs: 5000,
    retries: 1,
  },
} as const;
