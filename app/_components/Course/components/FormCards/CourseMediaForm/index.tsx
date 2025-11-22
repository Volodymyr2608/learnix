"use client";

import { Upload } from "lucide-react";
import { useCallback } from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { FieldError, FieldLabel } from "@/app/_components/_shared/ui/field";
import { cn } from "@/lib/utils/cn";

const CourseMediaForm = () => {
	const { control, setValue, watch, formState } = useFormContext();

	const thumbnail = watch("thumbnail");
	const previewVideo = watch("previewVideo");

	const handleFileDrop = useCallback(
		(e: React.DragEvent, fieldName: "thumbnail" | "previewVideo") => {
			e.preventDefault();
			const file = e.dataTransfer.files?.[0];
			if (file) setValue(fieldName, file, { shouldValidate: true });
		},
		[setValue],
	);

	const handleFileSelect = useCallback(
		(
			e: React.ChangeEvent<HTMLInputElement>,
			fieldName: "thumbnail" | "previewVideo",
		) => {
			const file = e.target.files?.[0];
			if (file) setValue(fieldName, file, { shouldValidate: true });
		},
		[setValue],
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Course Media</CardTitle>
				<CardDescription>
					Upload course thumbnail and preview video
				</CardDescription>
			</CardHeader>

			<CardContent className="space-y-6">
				<div className="space-y-2">
					<FieldLabel
						className="leading-none data-[invalid=true]:text-destructive"
						data-invalid={!!formState.errors.thumbnail?.message}
					>
						Course Thumbnail *
					</FieldLabel>

					<Controller
						control={control}
						name="thumbnail"
						render={() => {
							const error = formState.errors.thumbnail?.message as
								| string
								| undefined;

							return (
								<div className="space-y-1">
									<button
										className={cn(
											"w-full cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary",
											error && "border-destructive",
										)}
										onClick={() =>
											document.getElementById("thumbnailInput")?.click()
										}
										onDragOver={(e) => e.preventDefault()}
										onDrop={(e) => handleFileDrop(e, "thumbnail")}
										type="button"
									>
										<Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />

										{thumbnail ? (
											<p className="font-medium text-sm">{thumbnail.name}</p>
										) : (
											<>
												<p className="text-muted-foreground text-sm">
													Click to upload or drag and drop
												</p>
												<p className="mt-1 text-muted-foreground text-xs">
													PNG, JPG up to 2MB
												</p>
											</>
										)}
									</button>

									<input
										accept="image/*"
										className="hidden"
										id="thumbnailInput"
										onChange={(e) => handleFileSelect(e, "thumbnail")}
										type="file"
									/>

									<FieldError
										errors={error ? [{ message: error }] : undefined}
									/>
								</div>
							);
						}}
					/>
				</div>

				<div className="space-y-2">
					<FieldLabel
						className="leading-none data-[invalid=true]:text-destructive"
						data-invalid={!!formState.errors.previewVideo?.message}
					>
						Preview Video
					</FieldLabel>

					<Controller
						control={control}
						name="previewVideo"
						render={() => {
							const error = formState.errors.previewVideo?.message as
								| string
								| undefined;

							return (
								<div className="space-y-1">
									<button
										className={cn(
											"w-full cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary",
											error && "border-destructive",
										)}
										onClick={() =>
											document.getElementById("previewVideoInput")?.click()
										}
										onDragOver={(e) => e.preventDefault()}
										onDrop={(e) => handleFileDrop(e, "previewVideo")}
										type="button"
									>
										<Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />

										{previewVideo ? (
											<p className="font-medium text-sm">{previewVideo.name}</p>
										) : (
											<>
												<p className="text-muted-foreground text-sm">
													Click to upload or drag and drop
												</p>
												<p className="mt-1 text-muted-foreground text-xs">
													MP4, MOV up to 100MB
												</p>
											</>
										)}
									</button>

									<input
										accept="video/*"
										className="hidden"
										id="previewVideoInput"
										onChange={(e) => handleFileSelect(e, "previewVideo")}
										type="file"
									/>

									<FieldError
										errors={error ? [{ message: error }] : undefined}
									/>
								</div>
							);
						}}
					/>
				</div>
			</CardContent>
		</Card>
	);
};

export default CourseMediaForm;
