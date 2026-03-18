import CTASection from "@/app/_components/_shared/components/CTA";
import PageLayout from "@/app/_components/_shared/components/Layouts/PageLayout";
import FeaturedCourses from "@/app/_components/Home/FeaturedCourses";
import FeaturesSection from "@/app/_components/Home/FeaturesSection";
import HeroHome from "@/app/_components/Home/HeroHome";
import TestimonialsHome from "@/app/_components/Home/TestimonialsHome";

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
