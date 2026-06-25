"use client";

import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 767px)"; // below Tailwind `md` (768px)

const useIsMobile = (): boolean => {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const mql = window.matchMedia(MOBILE_QUERY);
		const onChange = () => setIsMobile(mql.matches);
		onChange();
		mql.addEventListener("change", onChange);
		return () => mql.removeEventListener("change", onChange);
	}, []);

	return isMobile;
};

export default useIsMobile;
