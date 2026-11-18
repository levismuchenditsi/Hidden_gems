import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.SUPABASE_DB_URL;
const databaseSslCertificate = process.env.SUPABASE_DB_SSL_CERT?.replace(
  /\\n/g,
  "\n",
);
const migrationDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../supabase/migrations",
);

function getErrorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

async function migrate(): Promise<void> {
  if (!databaseUrl) {
    console.error("Missing required environment variable SUPABASE_DB_URL.");
    process.exitCode = 1;
    return;
  }
  if (!databaseSslCertificate) {
    console.error(
      "Missing required environment variable SUPABASE_DB_SSL_CERT for verified TLS.",
    );
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { ca: databaseSslCertificate, rejectUnauthorized: true },
    max: 1,
  });

  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    const code = getErrorCode(error);
    console.error(
      `Could not connect to Supabase${code ? ` (connection code ${code})` : ""}. Check SUPABASE_DB_URL and database reachability.`,
    );
    process.exitCode = 1;
    await pool.end();
    return;
  }

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        version text NOT NULL UNIQUE,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
    `);
    await client.query("SELECT pg_advisory_lock(72618420261117)");

    const migrationFiles = (await readdir(migrationDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort((left, right) => left.localeCompare(right));
    const applied = await client.query<{ version: string }>(
      "SELECT version FROM public.schema_migrations",
    );
    const appliedVersions = new Set(applied.rows.map((row) => row.version));

    for (const filename of migrationFiles) {
      if (appliedVersions.has(filename)) {
        continue;
      }

      const sql = await readFile(
        path.join(migrationDirectory, filename),
        "utf8",
      );
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.schema_migrations (version) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
        console.log(`Applied migration ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        const code = getErrorCode(error);
        console.error(
          `Migration ${filename} failed${code ? ` (database code ${code})` : ""}.`,
        );
        process.exitCode = 1;
        break;
      }
    }
  } catch (error) {
    const code = getErrorCode(error);
    console.error(
      `Migration runner failed${code ? ` (database code ${code})` : ""}.`,
    );
    process.exitCode = 1;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(72618420261117)");
    } catch {
      // The connection is closing; no connection details are logged.
    }
    client.release();
    await pool.end();
  }
}

await migrate();
