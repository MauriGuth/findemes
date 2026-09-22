// Standalone seed entry: `node dist/seed.js`. Runs on Railway before every
// release (railway.json preDeployCommand) and locally via `pnpm db:seed`.
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';
import { seedCatalog } from './seed/catalog.seed.js';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const result = await seedCatalog(prisma);
  console.warn(
    `seed: ${String(result.sources)} sources, ${String(result.categories)} system categories`,
  );
} catch (error) {
  console.error('seed failed', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
