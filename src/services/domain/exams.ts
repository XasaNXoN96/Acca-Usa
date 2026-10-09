import type { Exam, ReviewPolicy, TestResult } from "@/types";

/** Shared exam rules (pure): availability window, server deadline, review visibility. */
export interface ExamLike { kind?: "topic_test" | "exam"; opensAt?: string | null; closesAt?: string | null; reviewPolicy?: ReviewPolicy }

export function windowStatus(t: ExamLike, now = Date.now()): Exam["status"] {
  if (t.closesAt && new Date(t.closesAt).getTime() < now) return "completed";
  if (t.opensAt && new Date(t.opensAt).getTime() > now) return "scheduled";
  return "open";
}

/** null = may start; otherwise the error code. Only exams have a window. */
export function startBlock(t: ExamLike, now = Date.now()): "EXAM_NOT_OPEN" | "EXAM_CLOSED" | null {
  if (t.kind !== "exam") return null;
  if (t.opensAt && now < new Date(t.opensAt).getTime()) return "EXAM_NOT_OPEN";
  if (t.closesAt && now > new Date(t.closesAt).getTime()) return "EXAM_CLOSED";
  return null;
}

/** The attempt ends at start + duration, but never after the exam closes (server clock). */
export function attemptDeadline(t: ExamLike, startedAt: number, durationMinutes: number): number {
  const byDuration = startedAt + durationMinutes * 60_000;
  return t.kind === "exam" && t.closesAt ? Math.min(byDuration, new Date(t.closesAt).getTime()) : byDuration;
}

/** Why (if at all) a student may not see the question review of this test right now. */
export function reviewState(t: ExamLike, now = Date.now()): "visible" | "after_close" | "never" {
  if (t.kind !== "exam") return "visible";
  if (t.reviewPolicy === "NEVER") return "never";
  if (t.reviewPolicy === "AFTER_CLOSE") return t.closesAt && new Date(t.closesAt).getTime() < now ? "visible" : "after_close";
  return "visible";
}

/** Applies the review policy to a frozen result when it is READ (the stored result is never changed). */
export function applyReviewPolicy(result: TestResult, t: ExamLike | undefined, now = Date.now()): TestResult {
  if (!t) return result;
  const state = reviewState(t, now);
  return state === "visible" ? result : { ...result, review: [], reviewHidden: state };
}

/** Admin input check for an exam window (both sides optional; closes must be after opens). */
export function windowInvalid(opensAt?: string | null, closesAt?: string | null): boolean {
  if (opensAt && Number.isNaN(Date.parse(opensAt))) return true;
  if (closesAt && Number.isNaN(Date.parse(closesAt))) return true;
  return !!(opensAt && closesAt && Date.parse(closesAt) <= Date.parse(opensAt));
}
