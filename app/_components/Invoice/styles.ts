import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
	page: {
		flexDirection: "column",
		backgroundColor: "#ffffff",
		padding: 60,
		fontFamily: "Helvetica",
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
		marginBottom: 40,
	},
	brand: {
		fontSize: 22,
		fontFamily: "Helvetica-Bold",
		color: "#111827",
	},
	headerTitle: {
		fontSize: 16,
		color: "#6B7280",
		textTransform: "uppercase",
		letterSpacing: 2,
	},
	body: {
		flex: 1,
	},
	label: {
		fontSize: 10,
		color: "#9CA3AF",
		textTransform: "uppercase",
		letterSpacing: 1,
		marginBottom: 4,
	},
	value: {
		fontSize: 13,
		color: "#111827",
		marginBottom: 16,
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		borderTop: "1px solid #E5E7EB",
		paddingTop: 16,
		marginTop: 8,
	},
	amount: {
		fontSize: 20,
		fontFamily: "Helvetica-Bold",
		color: "#111827",
	},
	refunded: {
		fontSize: 12,
		fontFamily: "Helvetica-Bold",
		color: "#DC2626",
		textTransform: "uppercase",
		letterSpacing: 1,
		marginTop: 4,
	},
	footer: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 40,
		paddingTop: 20,
		borderTop: "1px solid #E5E7EB",
	},
	footerText: {
		fontSize: 10,
		color: "#9CA3AF",
	},
});
