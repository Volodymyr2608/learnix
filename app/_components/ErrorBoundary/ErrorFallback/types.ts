export type ErrorFallbackProps = {
	error: Error & { digest?: string };
	reset: () => void;
};
