"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { services } from "@/services";
import { routes } from "@/lib/routes";

export async function markAllReadAction(): Promise<void> {
  const session = await services.auth.getSession("STUDENT");
  await services.notifications.markAllRead(session.user.id);
  revalidatePath("/", "layout");
}

export async function markReadAction(raw: unknown): Promise<void> {
  const id = z.string().min(1).max(64).safeParse(raw);
  if (!id.success) return;
  const session = await services.auth.getSession("STUDENT");
  await services.notifications.markRead(session.user.id, id.data);
  revalidatePath(routes.notifications);
}
