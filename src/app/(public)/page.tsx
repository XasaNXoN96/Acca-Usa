import { Hero } from "@/features/landing/hero";
import { PlatformsSection } from "@/features/landing/platforms-section";
import { FeaturesSection } from "@/features/landing/features-section";
import { ProcessSection } from "@/features/landing/process-section";
import { WhySection } from "@/features/landing/why-section";
import { StatsSection } from "@/features/landing/stats-section";
import { TestimonialsSection } from "@/features/landing/testimonials-section";
import { CtaSection } from "@/features/landing/cta-section";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <PlatformsSection />
      <FeaturesSection />
      <ProcessSection />
      <WhySection />
      <StatsSection />
      <TestimonialsSection />
      <CtaSection />
    </>
  );
}
