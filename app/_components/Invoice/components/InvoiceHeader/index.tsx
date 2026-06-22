import { Text, View } from "@react-pdf/renderer";
import { formatInvoiceDate, invoiceNumber } from "../../format";
import { styles } from "../../styles";
import type { InvoiceHeaderProps } from "../../types";

export const InvoiceHeader = ({
	paymentId,
	purchasedAt,
	status,
}: InvoiceHeaderProps) => {
	const isRefunded = status === "refunded";
	return (
		<View style={styles.header}>
			<View style={styles.brandRow}>
				<View style={styles.brandMark}>
					<Text style={styles.brandMarkText}>L</Text>
				</View>
				<View>
					<Text style={styles.brandName}>Learnix</Text>
					<Text style={styles.brandTagline}>Learn without limits</Text>
				</View>
			</View>

			<View style={styles.headerRight}>
				<Text style={styles.invoiceTitle}>INVOICE</Text>
				<View style={styles.metaRow}>
					<Text style={styles.metaLabel}>No.</Text>
					<Text style={styles.metaValue}>{invoiceNumber(paymentId)}</Text>
				</View>
				<View style={styles.metaRow}>
					<Text style={styles.metaLabel}>Date</Text>
					<Text style={styles.metaValue}>{formatInvoiceDate(purchasedAt)}</Text>
				</View>
				<Text
					style={[
						styles.pill,
						isRefunded ? styles.pillRefunded : styles.pillPaid,
					]}
				>
					{isRefunded ? "REFUNDED" : "PAID"}
				</Text>
			</View>
		</View>
	);
};
