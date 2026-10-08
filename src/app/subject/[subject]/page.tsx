import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/layout/public-shell";
import { StudentShell } from "@/components/layout/student-shell";
import { PublicSubjectView } from "@/features/subject/public-subject-view";
import { StudentSubjectView } from "@/features/subject/student-subject-view";
import { subjectTabs, type SubjectTab } from "@/features/subject/subject-nav";
import { getSession } from "@/lib/auth/session";
import { resolveAccess } from "@/lib/access";
import { services } from "@/services";

type Params = Promise<{ subject: string }>;
type Search = Promise<{ tab?: string | string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const subject = await services.subjects.getBySlug((await params).subject);
  if (!subject) return { title: "—" };
  return { title: `${subject.code} — ${subject.name}`, description: `${subject.name} (${subject.code})` };
}

function parseTab(raw: string | string[] | undefined): SubjectTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (subjectTabs as readonly string[]).includes(v ?? "") ? (v as SubjectTab) : "topics";
}

/**
 * /subject/<slug> is PUBLIC.
 *  - signed-in learner with access  → their workspace (progress, unlocking, tests, materials)
 *  - everyone else (anonymous, or signed in without access) → the public outline: topic titles + lock state only
 */
export default async function SubjectPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ subject: slug }, sp] = await Promise.all([params, searchParams]);
  const subject = await services.subjects.getBySlug(slug);
  if (!subject) notFound();

  const session = await getSession();
  const enrolled = session ? (await services.enrollments.listForUser(session.user.id)).filter((e) => e.status === "active").map((e) => e.platform) : [];
  const access = resolveAccess({ signedIn: !!session, enrolledPlatforms: enrolled }, subject.platform);

  if (session && access === "granted") {
    return (
      <StudentShell>
        <StudentSubjectView subject={subject} tab={parseTab(sp.tab)} userId={session.user.id} />
      </StudentShell>
    );
  }
  return (
    <PublicShell>
      <PublicSubjectView subject={subject} access={access === "login_required" ? "login_required" : "enrollment_required"} />
    </PublicShell>
  );
}
