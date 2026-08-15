import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import { UserRole } from "../types";

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  custom_role_title: string;
  avatar: string;
  status: "Active" | "Inactive";
  assigned_brand_id: string | null;
  assigned_talent_id: string | null;
  last_login: string | null;
  custom_permission_overrides: Record<string, boolean> | null;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  passwordRecovery: boolean;
  isInvite: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<{ error: string | null }>;
  reauthenticate: (password: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  updateEmail: (newEmail: string) => Promise<{ error: string | null }>;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [isInvite, setIsInvite] = useState(false);

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (!error && data) setProfile(data as Profile);
  };

  useEffect(() => {
    // Fallback for the Supabase recovery/invite-link hash (#access_token=...&type=recovery|invite).
    // The GoTrue client is supposed to auto-detect this and fire PASSWORD_RECOVERY via
    // onAuthStateChange, but that one-time parse races React StrictMode's double-invoked
    // effects (subscribe → unsubscribe → subscribe again) and the event can be dropped —
    // observed in practice as the app falling back to the Login screen with the hash still
    // sitting unprocessed in the URL. Parse it ourselves so recovery/invite works regardless of
    // timing. Invite links are treated the same as recovery — the invited user has no password
    // yet, so they must set one before they can use the app.
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const linkType = hashParams.get("type");
    const isRecoveryLink = linkType === "recovery";
    const isInviteLink = linkType === "invite";
    const recoveryAccessToken = hashParams.get("access_token");
    const recoveryRefreshToken = hashParams.get("refresh_token");
    if (isRecoveryLink || isInviteLink) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    if ((isRecoveryLink || isInviteLink) && recoveryAccessToken && recoveryRefreshToken) {
      setPasswordRecovery(true);
      setIsInvite(isInviteLink);
      supabase.auth
        .setSession({ access_token: recoveryAccessToken, refresh_token: recoveryRefreshToken })
        .then(({ data }) => {
          if (data.session) setSession(data.session);
          setLoading(false);
        });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        if (data.session) loadProfile(data.session.user.id);
        setLoading(false);
      });
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (newSession) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp: AuthContextValue["signUp"] = async (email, password, name) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (session) await loadProfile(session.user.id);
  };

  const sendPasswordResetEmail: AuthContextValue["sendPasswordResetEmail"] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    return { error: error?.message ?? null };
  };

  // Re-verifies the account's current password before allowing a change — signInWithPassword
  // simply re-authenticates the same session, it doesn't create a second one.
  const reauthenticate: AuthContextValue["reauthenticate"] = async (password) => {
    if (!profile) return { error: "Không tìm thấy phiên đăng nhập." };
    const { error } = await supabase.auth.signInWithPassword({ email: profile.email, password });
    return { error: error?.message ?? null };
  };

  const updatePassword: AuthContextValue["updatePassword"] = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  };

  // Supabase gửi email xác nhận tới địa chỉ mới (và thường cả địa chỉ cũ) trước khi thực sự đổi —
  // profiles.email chỉ đồng bộ sau khi xác nhận xong, qua trigger on_auth_user_email_updated
  // (0047_talent_rate_and_finance_security.sql), không phải ngay khi gọi hàm này.
  const updateEmail: AuthContextValue["updateEmail"] = async (newEmail) => {
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    return { error: error?.message ?? null };
  };

  const clearPasswordRecovery = () => {
    setPasswordRecovery(false);
    setIsInvite(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        passwordRecovery,
        isInvite,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        sendPasswordResetEmail,
        reauthenticate,
        updatePassword,
        updateEmail,
        clearPasswordRecovery
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
