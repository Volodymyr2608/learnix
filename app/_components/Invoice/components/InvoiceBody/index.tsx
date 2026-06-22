import { Text, View } from "@react-pdf/renderer";
import { styles } from "../../styles";
import type { InvoiceBodyProps } from "../../types";

function formatAmount(amountCents: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(amountCents / 100);
}

export const InvoiceBody = ({
	studentName,
	studentEmail,
	courseTitle,
	amountCents,
	currency,
	status,
}: InvoiceBodyProps) => {
	return (
		<View style={styles.body}>
			<Text style={styles.label}>Billed to</Text>
			<Text style={styles.value}>
				{studentName} ({studentEmail})
			</Text>

			<Text style={styles.label}>Course</Text>
			<Text style={styles.value}>{courseTitle}</Text>

			<View style={styles.row}>
				<Text style={styles.label}>Total paid</Text>
				<Text style={styles.amount}>{formatAmount(amountCents, currency)}</Text>
			</View>
			{status === "refunded" && <Text style={styles.refunded}>Refunded</Text>}
		</View>
	);
};
