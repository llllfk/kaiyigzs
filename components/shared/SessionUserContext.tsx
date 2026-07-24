"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/types";
import {
  DEFAULT_UI_PREFS,
  type UiPrefs,
  normalizeUiPrefs,
} from "@/lib/ui-prefs";

type SessionUserContextValue = {
  user: SessionUser;
  updateUser: (next: SessionUser) => void;
  uiPrefs: Required<UiPrefs>;
  setUiPrefs: (next: Required<UiPrefs> | UiPrefs) => void;
};

const SessionUserContext = createContext<SessionUserContextValue | null>(null);

export function SessionUserProvider({
  initialUser,
  initialUiPrefs,
  children,
}: {
  initialUser: SessionUser;
  initialUiPrefs?: UiPrefs | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState(initialUser);
  const [uiPrefs, setUiPrefsState] = useState<Required<UiPrefs>>(() =>
    normalizeUiPrefs(initialUiPrefs ?? DEFAULT_UI_PREFS)
  );
  useEffect(() => setUser(initialUser), [initialUser]);
  useEffect(() => {
    setUiPrefsState(normalizeUiPrefs(initialUiPrefs ?? DEFAULT_UI_PREFS));
  }, [initialUiPrefs]);

  const value = useMemo(
    () => ({
      user,
      updateUser: setUser,
      uiPrefs,
      setUiPrefs: (next: Required<UiPrefs> | UiPrefs) => {
        setUiPrefsState(normalizeUiPrefs(next));
      },
    }),
    [user, uiPrefs]
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
