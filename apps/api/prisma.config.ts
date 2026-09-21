import 'dotenv/config';

import { defineConfig } from 'prisma/config';

// `prisma generate` never connects, but Prisma 7 refuses to load the config
// without a datasource URL. Docker builds and CI typechecks run without one,
// so fall back to a placeholder; every real command (migrate, studio) and the
// app itself validate DATABASE_URL and fail loudly if it is missing.
const url =
  process.env['DATABASE_URL'] ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: { url },
});
