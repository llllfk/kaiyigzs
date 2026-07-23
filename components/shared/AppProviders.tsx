"use client";

import { UiProvider } from "@/components/ui/Feedback";
import { NavigationProgress } from "@/components/ui/NavigationProgress";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <UiProvider>
      <NavigationProgress />
      {children}
    </UiProvider>
  );
}
