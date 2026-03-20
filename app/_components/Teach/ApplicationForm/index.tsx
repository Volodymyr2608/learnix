import InstructorApplicationForm from "@/app/_components/Teach/ApplicationForm/components/InstructorApplicationForm";

const ApplicationForm = () => {
	return (
		<section className="bg-muted/30 py-16">
			<div className="container mx-auto max-w-3xl px-4">
				<div className="mb-8 text-center">
					<h2 className="mb-4 font-bold text-3xl">
						Apply to Become an Instructor
					</h2>
					<p className="text-muted-foreground">
						Fill out the form below and we'll review your application within 2-3
						business days.
					</p>
				</div>
				<InstructorApplicationForm />
			</div>
		</section>
	);
};

export default ApplicationForm;
