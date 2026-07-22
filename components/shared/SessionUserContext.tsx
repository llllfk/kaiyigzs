"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/types";

type SessionUserContextValue = {
  user: SessionUser;
  updateUser: (next: SessionUser) => void;
};

const SessionUserContext = createContext<SessionUserContextValue | null>(null);

export function SessionUserProvider({
  initialUser,
  children,
}: {
  initialUser: SessionUser;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  useEffect(() => setUser(initialUser), [initialUser]);
  const value = useMemo(
    () => ({ user, updateUser: setUser }),
    [user]
  );
  return (
    <SessionUserContext.Provider value={value}>
      {children}
    </SessionUserContext.Provider>
  );
}

export function useSessionUserContext() {
  const value = useContext(SessionUserContext);
  if (!value) throw new Error("useSessionUserContext must be used inside AppShell");
  return value;
}

export function useSessionUser() {
  return useSessionUserContext().user;
}
