import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { consumeSignInIntent, markUnlocked, setPasswordAuthNow } from "@/lib/appLock";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      // A genuine sign-in unlocks this tab. `SIGNED_IN` alone does NOT mean
      // one happened — supabase-js fires it from `_recoverAndRefresh()` on
      // every page load that restores a stored session, which is why a reload
      // used to walk straight through the lock screen (BUG-090). The marker is
      // set by the screen that asked for the credential, so only a sign-in
      // this tab actually performed can spend it.
      if (event === "SIGNED_IN" && s?.user && consumeSignInIntent()) {
        markUnlocked(s.user.id);
        setPasswordAuthNow(s.user.id); // resets the 12-hour PIN window
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);