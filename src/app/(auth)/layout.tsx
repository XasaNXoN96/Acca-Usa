import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { DemoModeBadge } from "@/components/layout/demo-mode-badge";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <header className="container-page flex h-16 items-center justify-between gap-2">
        <Logo />
        <div className="flex items-center gap-1">
          <DemoModeBadge className="mr-1 hidden sm:inline-flex" />
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="container-page grid flex-1 place-items-center py-8 outline-none">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-md sm:p-8">{children}</div>
      </main>
    </div>
  );
}
