export type ConceptCheckPanelProps = {
	lessonId: string;
	/**
	 * Which conversation turn is on screen. It only ever has to change — the
	 * panel reads it as "the conversation moved on", which is how long an
	 * answered check's verdict is kept.
	 */
	turn: number;
};
