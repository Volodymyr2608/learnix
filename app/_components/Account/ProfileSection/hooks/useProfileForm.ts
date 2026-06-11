import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
	type ProfileUpdateData,
	ProfileUpdateSchema,
} from "@/server/entities/user";
import { api } from "@/trpc/client";

const useProfileForm = (initialName: string, initialImage: string | null) => {
	const {
		control,
		handleSubmit,
		reset,
		formState: { isDirty },
	} = useForm<ProfileUpdateData>({
		resolver: zodResolver(ProfileUpdateSchema),
		defaultValues: { name: initialName, image: initialImage },
	});

	useEffect(() => {
		reset({ name: initialName, image: initialImage });
	}, [initialName, initialImage, reset]);

	const updateProfile = api.user.updateProfile.useMutation({
		onSuccess: () => toast.success("Profile updated."),
		onError: () => toast.error("Failed to update profile."),
	});

	const onSubmit = handleSubmit((data) => updateProfile.mutate(data));

	return { control, onSubmit, isPending: updateProfile.isPending, isDirty };
};

export default useProfileForm;
