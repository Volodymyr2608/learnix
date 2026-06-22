import { StyleSheet } from "@react-pdf/renderer";

const BRAND = "#4F46E5";
const INK = "#111827";
const MUTED = "#6B7280";
const FAINT = "#9CA3AF";
const LINE = "#E5E7EB";
const HAIRLINE = "#F3F4F6";

export const styles = StyleSheet.create({
	page: {
		flexDirection: "column",
		backgroundColor: "#ffffff",
		padding: 0,
		fontFamily: "Helvetica",
		color: INK,
		fontSize: 11,
	},
	accentBar: {
		height: 8,
		backgroundColor: BRAND,
	},
	content: {
		flex: 1,
		paddingHorizontal: 48,
		paddingTop: 40,
		paddingBottom: 40,
	},

	// Header
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 40,
	},
	brandRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	brandMark: {
		width: 38,
		height: 38,
		borderRadius: 9,
		backgroundColor: BRAND,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 11,
	},
	brandMarkText: {
		color: "#ffffff",
		fontFamily: "Helvetica-Bold",
		fontSize: 20,
	},
	brandName: {
		fontSize: 19,
		fontFamily: "Helvetica-Bold",
		color: INK,
	},
	brandTagline: {
		fontSize: 9,
		color: FAINT,
		marginTop: 2,
	},
	headerRight: {
		alignItems: "flex-end",
	},
	invoiceTitle: {
		fontSize: 24,
		fontFamily: "Helvetica-Bold",
		color: INK,
		letterSpacing: 3,
	},
	metaRow: {
		flexDirection: "row",
		marginTop: 8,
	},
	metaLabel: {
		fontSize: 9,
		color: FAINT,
		marginRight: 6,
	},
	metaValue: {
		fontSize: 9,
		color: INK,
		fontFamily: "Helvetica-Bold",
	},

	// Status pill
	pill: {
		marginTop: 10,
		paddingVertical: 4,
		paddingHorizontal: 11,
		borderRadius: 11,
		fontSize: 9,
		fontFamily: "Helvetica-Bold",
		letterSpacing: 1,
	},
	pillPaid: {
		backgroundColor: "#ECFDF5",
		color: "#059669",
	},
	pillRefunded: {
		backgroundColor: "#FEF2F2",
		color: "#DC2626",
	},

	// Billed-to block
	billBlock: {
		marginBottom: 32,
	},
	blockLabel: {
		fontSize: 9,
		color: FAINT,
		textTransform: "uppercase",
		letterSpacing: 1,
		marginBottom: 6,
	},
	blockName: {
		fontSize: 13,
		fontFamily: "Helvetica-Bold",
		color: INK,
		marginBottom: 2,
	},
	blockText: {
		fontSize: 10,
		color: MUTED,
	},

	// Line-item table
	tableHead: {
		flexDirection: "row",
		backgroundColor: "#F9FAFB",
		borderTop: `1px solid ${LINE}`,
		borderBottom: `1px solid ${LINE}`,
		paddingVertical: 9,
		paddingHorizontal: 12,
	},
	tableHeadCell: {
		fontSize: 8.5,
		color: MUTED,
		textTransform: "uppercase",
		letterSpacing: 1,
		fontFamily: "Helvetica-Bold",
	},
	tableRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 15,
		paddingHorizontal: 12,
		borderBottom: `1px solid ${HAIRLINE}`,
	},
	colDesc: {
		flex: 1,
	},
	colAmount: {
		width: 120,
		textAlign: "right",
	},
	itemTitle: {
		fontSize: 12,
		fontFamily: "Helvetica-Bold",
		color: INK,
		marginBottom: 3,
	},
	itemSub: {
		fontSize: 9,
		color: FAINT,
	},
	itemAmount: {
		fontSize: 12,
		color: INK,
	},

	// Totals
	totals: {
		flexDirection: "row",
		justifyContent: "flex-end",
		marginTop: 18,
	},
	totalsBox: {
		width: 240,
	},
	totalsRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: 5,
	},
	totalsLabel: {
		fontSize: 10,
		color: MUTED,
	},
	totalsValue: {
		fontSize: 10,
		color: INK,
	},
	grandRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginTop: 8,
		paddingVertical: 12,
		paddingHorizontal: 14,
		backgroundColor: "#EEF2FF",
		borderRadius: 8,
	},
	grandLabel: {
		fontSize: 12,
		fontFamily: "Helvetica-Bold",
		color: BRAND,
	},
	grandValue: {
		fontSize: 16,
		fontFamily: "Helvetica-Bold",
		color: BRAND,
	},
	refundNote: {
		marginTop: 12,
		fontSize: 9,
		color: "#DC2626",
		textAlign: "right",
	},

	// Footer
	footer: {
		marginTop: "auto",
		paddingTop: 20,
		borderTop: `1px solid ${LINE}`,
	},
	footerThanks: {
		fontSize: 11,
		fontFamily: "Helvetica-Bold",
		color: INK,
		marginBottom: 4,
	},
	footerText: {
		fontSize: 9,
		color: FAINT,
		marginBottom: 2,
	},
});
