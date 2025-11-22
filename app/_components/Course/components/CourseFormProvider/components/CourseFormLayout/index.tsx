"use client";

import type { PropsWithChildren } from "react";

const CourseFormLayout = ({ children }: PropsWithChildren) => {
	return <form className="space-y-6">{children}</form>;
};

export default CourseFormLayout;
