import { StyleSheet } from "@react-pdf/renderer";

export const styles = StyleSheet.create({
	page: {
		flexDirection: "column",
		backgroundColor: "#ffffff",
		padding: 60,
		fontFamily: "Helvetica",
	},
	header: {
		alignItems: "center",
		marginBottom: 40,
	},
	headerTitle: {
		fontSize: 28,
		fontWeight: "bold",
		color: "#111827",
		textTransform: "uppercase",
		letterSpacing: 4,
	},
	headerSubtitle: {
		fontSize: 14,
		color: "#6B7280",
		marginTop: 4,
	},
	body: {
		alignItems: "center",
		flex: 1,
		justifyContent: "center",
	},
	bodyPresented: {
		fontSize: 14,
		color: "#6B7280",
		marginBottom: 8,
	},
	bodyName: {
		fontSize: 36,
		fontFamily: "Helvetica-Bold",
		color: "#111827",
		marginBottom: 12,
	},
	bodyCompleted: {
		fontSize: 14,
		color: "#6B7280",
		marginBottom: 8,
	},
	bodyCourseTitle: {
		fontSize: 22,
		fontFamily: "Helvetica-Bold",
		color: "#4F46E5",
		textAlign: "center",
	},
	bodyInstructor: {
		fontSize: 13,
		color: "#6B7280",
		marginTop: 10,
	},
	footer: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 40,
		paddingTop: 20,
		borderTop: "1px solid #E5E7EB",
	},
	footerText: {
		fontSize: 11,
		color: "#9CA3AF",
	},
});
