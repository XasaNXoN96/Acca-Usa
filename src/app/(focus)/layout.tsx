/** Distraction-free frame for tests and results: no sidebar, no site navigation. */
export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-app">{children}</div>;
}
