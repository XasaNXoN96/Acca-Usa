import { PlatformLanding, platformMetadata } from "@/features/platform/platform-landing";

export const generateMetadata = () => platformMetadata("fia");

export default function Page() {
  return <PlatformLanding slug="fia" />;
}
