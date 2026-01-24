"use client";

import { FluentProvider, Toaster, webLightTheme } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { I18nProvider } from "@/components/i18n-provider";

const appTheme = {
  ...webLightTheme,
  fontFamilyBase:
    '"Segoe UI Variable", "Segoe UI", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif',
};

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <FluentProvider theme={appTheme}>
      <I18nProvider>
        {children}
        <Toaster position="top-end" />
      </I18nProvider>
    </FluentProvider>
  );
}
