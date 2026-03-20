import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { instructorSchema } from "@/server/entities/instructor";

const defaultValues = {
	fullName: "",
	email: "",
	phone: "",
	expertise: "",
	experience: "",
	bio: "",
	courseIdea: "",
	linkedIn: "",
	website: "",
};

const useInstructorForm = () => {
	return useForm({
		resolver: zodResolver(instructorSchema),
		defaultValues,
	});
};

export default useInstructorForm;
