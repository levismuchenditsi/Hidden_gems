export interface SupabaseAuthVerifier {
  auth: {
    getUser(
      jwt: string,
    ): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
}

export interface SupabaseAdminRoleReader {
  hasAdminRole(userId: string): Promise<{
    isAdmin: boolean;
    error: boolean;
  }>;
}

export type AdminAccessResult =
  | { status: 200; userId: string }
  | { status: 401 | 403 | 503 };

export async function verifyDatabaseAdmin(
  jwt: string | null,
  authVerifier: SupabaseAuthVerifier,
  roleReader: SupabaseAdminRoleReader,
): Promise<AdminAccessResult> {
  if (!jwt) {
    return { status: 401 };
  }

  const { data, error } = await authVerifier.auth.getUser(jwt);
  if (error || !data.user) {
    return { status: 401 };
  }

  const { isAdmin, error: roleError } = await roleReader.hasAdminRole(
    data.user.id,
  );

  if (roleError) {
    return { status: 503 };
  }
  if (!isAdmin) {
    return { status: 403 };
  }

  return { status: 200, userId: data.user.id };
}
