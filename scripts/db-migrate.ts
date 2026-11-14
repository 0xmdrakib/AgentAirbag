import { existsSync } from 'node:fs';
import { applySchema, describeSchemaStatement } from '../packages/server/src/store';

for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  try {
    process.loadEnvFile(file);
  } catch {
    console.warn(`Could not load ${file}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim().length === 0) {
    console.error(
      'DATABASE_URL is not set. Add a Neon connection string to .env (see .env.example), then run pnpm db:migrate.',
    );
    process.exitCode = 1;
    return;
  }

  const statements = await applySchema(databaseUrl.trim());
  for (const statement of statements) {
    const label = describeSchemaStatement(statement);
    console.log(label === 'schema statement' ? `Applied: ${statement}` : `Ensured ${label}.`);
  }
  console.log(`Schema is up to date (${statements.length} statements applied from db/schema.sql).`);
}

await main().catch((error: unknown) => {
  console.error('Database migration failed:', error instanceof Error ? error.message : error);
  console.error('Check DATABASE_URL and that the database accepts connections from this machine.');
  process.exitCode = 1;
});
