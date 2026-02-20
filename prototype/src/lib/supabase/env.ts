const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Add it to your deployment environment.`,
    );
  }

  return value;
};

export const getSupabaseUrl = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
export const getSupabaseAnonKey = () =>
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const getSupabaseServiceRoleKey = () =>
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
