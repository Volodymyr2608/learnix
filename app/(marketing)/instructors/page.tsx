import PageLayout from "@/app/_components/_shared/components/Layouts/PageLayout";
import ApplicationForm from "@/app/_components/Teach/ApplicationForm";
import Benefits from "@/app/_components/Teach/Benefits";
import TeachHero from "@/app/_components/Teach/TeachHero";

const BecomeInstructorPage = () => {
	return (
		<PageLayout>
			<TeachHero />
			<Benefits />
			<ApplicationForm />
		</PageLayout>
	);
};

export default BecomeInstructorPage;
