"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  getAccessToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const publicPaths = new Set(["/login"]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setUser(data.user);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const isPublicPath = publicPaths.has(pathname);

    if (!user && !isPublicPath) {
      router.replace("/login");
      return;
    }

    if (user && pathname === "/login") {
      router.replace("/");
    }
  }, [isLoading, pathname, router, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      getAccessToken: async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
      },
      signOut: async () => {
        await supabase.auth.signOut();
        router.replace("/login");
      },
    }),
    [isLoading, router, user],
  );

  const isPublicPath = publicPaths.has(pathname);

  if (isLoading && !isPublicPath) {
    return (
      <main className="auth-loading">
        <p>Sprawdzam logowanie...</p>
      </main>
    );
  }

  if (!user && !isPublicPath) {
    return (
      <main className="auth-loading">
        <p>Przekierowuje do logowania...</p>
      </main>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth musi byc uzyte wewnatrz AuthProvider.");
  }

  return context;
}
