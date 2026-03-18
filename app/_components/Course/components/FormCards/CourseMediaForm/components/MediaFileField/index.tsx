import { Upload, X } from "lucide-react";
import Image from "next/image";
import {
	type ChangeEvent,
	type DragEvent,
	useCallback,
	useEffect,
	useState,
} from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Button } from "@/app/_components/_shared/ui/button";
import { FieldError, FieldLabel } from "@/app/_components/_shared/ui/field";
import type {
	MediaFileFieldProps,
	PreviewType,
} from "@/app/_components/Course/components/FormCards/CourseMediaForm/components/MediaFileField/types";

const MediaFileField = ({
	name,
	fileUrl,
	label,
	accept,
	buttonLabel,
	uploadTitle,
	uploadDescription,
	uploadTitleDragging,
	typeMedia,
}: MediaFileFieldProps) => {
	const { control, setValue, watch, formState } = useFormContext();

	const file: File | null = watch(name);

	const [isDragging, setIsDragging] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | null>(fileUrl);
	const [previewType, setPreviewType] = useState<PreviewType>(typeMedia);

	const generatePreview = useCallback((file: File) => {
		if (file.type.startsWith("video/")) {
			const url = URL.createObjectURL(file);
			setPreviewType("video");
			setPreviewUrl(url);
			return;
		}

		if (file.type.startsWith("image/")) {
			const reader = new FileReader();
			reader.onloadend = () => {
				setPreviewType("image");
				setPreviewUrl(reader.result as string);
			};
			reader.readAsDataURL(file);
		}
	}, []);

	const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setValue(name, file, { shouldValidate: true });
		generatePreview(file);
	};

	const handleDragEnter = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	};

	const handleDragOver = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const handleDrop = (e: DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);

		const file = e.dataTransfer.files?.[0];
		if (
			file &&
			(file.type.startsWith("image/") || file.type.startsWith("video/"))
		) {
			setValue(name, file, { shouldValidate: true });
			const reader = new FileReader();
			reader.onloadend = () => {
				setPreviewUrl(reader.result as string);
			};
			reader.readAsDataURL(file);
		}
	};

	const handleRemove = () => {
		if (previewType === "video" && previewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
		setPreviewUrl(null);
		setPreviewType(null);
		setValue(name, null, { shouldValidate: true });
	};

	useEffect(() => {
		return () => {
			if (previewType === "video" && previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, [previewUrl, previewType]);

	return (
		<div className="space-y-2">
			<FieldLabel
				className="leading-none data-[invalid=true]:text-destructive"
				data-invalid={!!formState.errors[name]?.message}
			>
				{label}
			</FieldLabel>

			<Controller
				control={control}
				name={name}
				render={() => {
					const error = formState.errors[name]?.message as string | undefined;

					return (
						<div className="space-y-1">
							{previewUrl ? (
								<div className="space-y-2">
									<div className="relative aspect-video w-full overflow-hidden rounded-lg border">
										{previewType === "image" && (
											<Image
												alt="Preview"
												className="h-full w-full object-cover"
												fill
												src={previewUrl}
											/>
										)}

										{previewType === "video" && (
											<video className="h-full w-full object-cover" controls>
												<track
													default
													kind="captions"
													src="SUBTITLE_PATH"
													srcLang="en"
												/>
												<source src={previewUrl} type="video/mp4" />
											</video>
										)}

										<Button
											className="absolute top-2 right-2"
											onClick={handleRemove}
											size="icon"
											variant="destructive"
										>
											<X className="h-4 w-4" />
										</Button>
									</div>

									<div className="flex items-center gap-2">
										<Button asChild size="sm" variant="outline">
											<label className="cursor-pointer">
												<Upload className="mr-2 h-4 w-4" />
												{buttonLabel}
												<input
													accept={accept}
													className="hidden"
													onChange={handleFileChange}
													type="file"
												/>
											</label>
										</Button>

										{file instanceof File && (
											<p className="text-muted-foreground text-sm">
												New file: {file.name}
											</p>
										)}
									</div>
								</div>
							) : (
								<button
									className={`w-full rounded-lg border-2 border-dashed text-center transition-colors ${
										isDragging
											? "border-primary bg-primary/5"
											: "hover:border-primary"
									}`}
									onDragEnter={handleDragEnter}
									onDragLeave={handleDragLeave}
									onDragOver={handleDragOver}
									onDrop={handleDrop}
									type="button"
								>
									<label className="block cursor-pointer p-8">
										<Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
										<p className="text-muted-foreground text-sm">
											{isDragging ? uploadTitleDragging : uploadTitle}
										</p>
										<p className="mt-1 text-muted-foreground text-xs">
											{uploadDescription}
										</p>
										<input
											accept={accept}
											className="hidden"
											onChange={handleFileChange}
											type="file"
										/>
									</label>
								</button>
							)}
							<FieldError errors={error ? [{ message: error }] : undefined} />
						</div>
					);
				}}
			/>
		</div>
	);
};

export default MediaFileField;
