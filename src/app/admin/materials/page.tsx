import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminResourcePage } from "@/features/admin/resource-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.resources"))("materials.title") };
}

export default function Page() {
  return <AdminResourcePage resource="materials" />;
}
