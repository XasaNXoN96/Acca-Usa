import { PlatformLanding, platformMetadata } from "@/features/platform/platform-landing";

export const generateMetadata = () => platformMetadata("cima");

export default function Page() {
  return <PlatformLanding slug="cima" />;
}
