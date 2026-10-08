import type en from "@/i18n/messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: "en" | "ru" | "uz";
    // English is the source of truth: calling t("missing.key") fails typecheck.
    Messages: typeof en;
  }
}
