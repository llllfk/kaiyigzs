"use client";

import { UiProvider } from "@/components/ui/Feedback";
import { NavigationProgress } from "@/components/ui/NavigationProgress";
import { DynamicStylesheetLoader } from "@/components/shared/DynamicStylesheetLoader";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <UiProvider>
      <NavigationProgress />
      <DynamicStylesheetLoader />
      {children}
    </UiProvider>
  );
}
