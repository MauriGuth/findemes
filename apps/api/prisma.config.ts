import 'dotenv/config';

import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Lazy: `prisma generate` runs without a database (Docker build, CI typecheck).
    url: env('DATABASE_URL'),
  },
});
