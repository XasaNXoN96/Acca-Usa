import { PlatformLanding, platformMetadata } from "@/features/platform/platform-landing";

export const generateMetadata = () => platformMetadata("acca");

export default function Page() {
  return <PlatformLanding slug="acca" />;
}
