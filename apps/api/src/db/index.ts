import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema.js';

export type DB = ReturnType<typeof drizzlePg<typeof schema>>;

const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname;

// DATABASE_URL yoksa (yerel geliştirme) gömülü PGlite kullanılır.
async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const db = drizzlePg(postgres(url, { max: 10 }), { schema });
    await migratePg(db, { migrationsFolder });
    return db;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const db = drizzle(new PGlite(process.env.PGLITE_DIR ?? './.pglite'), { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as DB;
}

export const db = await connect();
export * as t from './schema.js';
