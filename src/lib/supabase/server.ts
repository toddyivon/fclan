import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: async (cookiesToSet) => {
          const cs = await cookies();
          cookiesToSet.forEach(({ name, value, options }) =>
            cs.set(name, value, options)
          );
        },
      },
    }
  );
}
