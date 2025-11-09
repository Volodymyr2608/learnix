import PageLayout from "@/app/_components/_shared/Layouts/PageLayout";
import HeroHome from "@/app/_components/Home/HeroHome";
import FeaturedCourses from "@/app/_components/Home/FeaturedCourses";
import FeaturesSection from "@/app/_components/Home/FeaturesSection";
import TestimonialsHome from "@/app/_components/Home/TestimonialsHome";
import CTASection from "@/app/_components/_shared/CTA";

export default async function Home() {

	return (
    <PageLayout>
      <HeroHome />
      <FeaturedCourses />
      <FeaturesSection />
      <TestimonialsHome />
      <CTASection />
    </PageLayout>
	);
}
