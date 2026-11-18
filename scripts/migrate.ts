import { readdir, readFile } from "node:fs/promises";
import { X509Certificate } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const databaseUrl = process.env.SUPABASE_DB_URL;
const databaseSslCertificateBase64 = process.env.SUPABASE_DB_SSL_CERT_B64;
const expectedCertificateFingerprint =
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";
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

function useVerifiedTlsUrl(connectionString: string): string {
  const url = new URL(connectionString);
  for (const parameter of [...url.searchParams.keys()]) {
    const normalizedParameter = parameter.toLowerCase();
    if (
      normalizedParameter.startsWith("ssl") ||
      normalizedParameter === "uselibpqcompat"
    ) {
      url.searchParams.delete(parameter);
    }
  }
  return url.toString();
}

function getVerifiedDatabaseCertificate(): string | undefined {
  if (!databaseSslCertificateBase64) {
    console.error(
      "Missing required environment variable SUPABASE_DB_SSL_CERT_B64.",
    );
    return undefined;
  }

  const encodedCertificate = databaseSslCertificateBase64.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encodedCertificate)) {
    console.error("SUPABASE_DB_SSL_CERT_B64 is not valid Base64.");
    return undefined;
  }

  const decodedBytes = Buffer.from(encodedCertificate, "base64");
  const canonicalBase64 = decodedBytes.toString("base64").replace(/=+$/, "");
  if (
    canonicalBase64 !== encodedCertificate.replace(/=+$/, "") ||
    decodedBytes.length === 0
  ) {
    console.error("SUPABASE_DB_SSL_CERT_B64 is not valid Base64.");
    return undefined;
  }

  const certificatePem = decodedBytes
    .toString("utf8")
    .replace(/\\+r\\+n/g, "\n")
    .replace(/\\+n/g, "\n")
    .trim();
  const certificateBlocks =
    certificatePem.match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    ) ?? [];
  if (certificateBlocks.length !== 1) {
    console.error(
      "SUPABASE_DB_SSL_CERT_B64 must decode to exactly one PEM certificate.",
    );
    return undefined;
  }

  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(certificateBlocks[0]);
  } catch {
    console.error(
      "SUPABASE_DB_SSL_CERT_B64 did not decode to a valid X.509 PEM certificate.",
    );
    return undefined;
  }

  const actualFingerprint = certificate.fingerprint256.toUpperCase();
  console.log(`Decoded certificate SHA-256 fingerprint: ${actualFingerprint}`);
  if (
    actualFingerprint.replace(/:/g, "") !==
    expectedCertificateFingerprint.replace(/:/g, "")
  ) {
    console.error(
      `Certificate fingerprint mismatch; expected ${expectedCertificateFingerprint}. Stopped before connecting.`,
    );
    return undefined;
  }

  return certificateBlocks[0];
}

async function migrate(): Promise<void> {
  if (!databaseUrl) {
    console.error("Missing required environment variable SUPABASE_DB_URL.");
    process.exitCode = 1;
    return;
  }
  const databaseSslCertificate = getVerifiedDatabaseCertificate();
  if (!databaseSslCertificate) {
    process.exitCode = 1;
    return;
  }

  let verifiedTlsUrl: string;
  try {
    verifiedTlsUrl = useVerifiedTlsUrl(databaseUrl);
  } catch {
    console.error("SUPABASE_DB_URL must be a valid PostgreSQL connection URI.");
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({
    connectionString: verifiedTlsUrl,
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
