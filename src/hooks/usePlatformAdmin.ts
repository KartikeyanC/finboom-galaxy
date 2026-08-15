import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Whether the signed-in user is a Product Owner / platform admin. */
export function usePlatformAdmin() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["is-platform-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin");
      if (error) throw error;
      return Boolean(data);
    },
  });
  return {
    isPO: (q.data ?? false) as boolean,
    loading: loading || (!!user && q.isLoading),
    checked: q.isFetched || !user,
  };
}
