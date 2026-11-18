---
name: Supabase migration TLS
description: Secure TLS configuration for node-postgres connections to Supabase.
---

When node-postgres receives both `connectionString` and explicit TLS options, SSL-related query parameters in the URL can override the supplied TLS configuration. Remove conflicting SSL query parameters before passing the URL, then set the trusted CA explicitly.

The CA must match the actual endpoint and connection mode. If verification still fails, confirm the connection URI and CA came from the same Supabase project and endpoint. Do not work around a mismatch by setting `rejectUnauthorized: false`.

**Why:** A Supavisor session-pooler connection continued to fail certificate verification after the project certificate was supplied; bypassing verification would weaken protection against man-in-the-middle attacks.

**How to apply:** Use this when configuring `pg` for Supabase migrations or other privileged database scripts. Keep certificate verification enabled and resolve endpoint/CA mismatches before running SQL.
