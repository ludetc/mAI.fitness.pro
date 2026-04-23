import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import type {
  AuthGoogleRequest,
  AuthGoogleResponse,
  MeResponse,
  Profile,
  ProfileStatusResponse,
  User,
} from "@mai/shared";
import { api, ApiError } from "../lib/api";
import { clearToken, getToken, setToken } from "../lib/session";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  onboardingConversationId: string | null;
  status: AuthStatus;
  signInWithIdToken: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const loadProfile = useCallback(async () => {
    try {
      const res = await api<ProfileStatusResponse>("/me/profile");
      setProfile(res.profile);
      setOnboardingId(res.onboardingConversationId);
    } catch {
      setProfile(null);
      setOnboardingId(null);
    }
  }, []);

  const hydrate = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setStatus("signedOut");
      return;
    }
    try {
      const me = await api<MeResponse>("/me");
      setUser(me.user);
      await loadProfile();
      setStatus("signedIn");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearToken();
      }
      setUser(null);
      setProfile(null);
      setOnboardingId(null);
      setStatus("signedOut");
    }
  }, [loadProfile]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const signInWithIdToken = useCallback(
    async (idToken: string) => {
      console.log("AuthProvider: Attempting sign-in with ID token");
      try {
        const body: AuthGoogleRequest = { idToken };
        const res = await api<AuthGoogleResponse>("/auth/google", {
          method: "POST",
          body: JSON.stringify(body),
          auth: false,
        });
        console.log("AuthProvider: Sign-in successful, setting token");
        await setToken(res.token);
        setUser(res.user);
        await loadProfile();
        setStatus("signedIn");
      } catch (err) {
        console.error("AuthProvider: Sign-in failed", err);
        throw err;
      }
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
    setProfile(null);
    setOnboardingId(null);
    setStatus("signedOut");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        onboardingConversationId: onboardingId,
        status,
        signInWithIdToken,
        signOut,
        refreshProfile: loadProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
