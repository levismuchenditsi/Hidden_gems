import { createClient } from "@supabase/supabase-js";
import { Router } from "express";
import {
  verifyDatabaseAdmin,
  type SupabaseAdminRoleReader,
  type SupabaseAuthVerifier,
} from "../../../../server/admin-access";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error(
    "VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY must be configured for the admin API.",
  );
}

const authVerifier = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
const roleReader = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
const adminRoleLookup = {
  async hasAdminRole(userId: string) {
    const { data, error } = await roleReader
      .from("user_roles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: Boolean(data), error: Boolean(error) };
  },
};

export function createAdminRouter(
  verifier: SupabaseAuthVerifier,
  roleLookup: SupabaseAdminRoleReader,
) {
  const router = Router();

  router.get("/admin/status", async (req, res) => {
    const authorization = req.get("authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

    try {
      const result = await verifyDatabaseAdmin(token, verifier, roleLookup);
      if (result.status === 200) {
        res.status(200).json({ isAdmin: true });
        return;
      }
      if (result.status === 401) {
        res.status(401).json({ error: "A valid Supabase access token is required." });
        return;
      }
      if (result.status === 403) {
        res.status(403).json({ error: "Admin access is required." });
        return;
      }
      res.status(503).json({ error: "Admin status could not be verified." });
    } catch {
      res.status(503).json({ error: "Admin status could not be verified." });
    }
  });

  return router;
}

const router = createAdminRouter(authVerifier, adminRoleLookup);

export default router;
