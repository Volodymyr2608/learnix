export type PayoutStaleEmailProps = {
	/** ISO time of the last successful run, or null if none ever succeeded. */
	lastSuccessAt: string | null;
	panelUrl: string;
};
