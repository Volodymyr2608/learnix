import { Text, View } from "@react-pdf/renderer";
import { formatInvoiceAmount } from "../../format";
import { styles } from "../../styles";
import type { InvoiceBodyProps } from "../../types";

export const InvoiceBody = ({
	studentName,
	studentEmail,
	courseTitle,
	amountCents,
	currency,
	status,
}: InvoiceBodyProps) => {
	const amount = formatInvoiceAmount(amountCents, currency);
	const isRefunded = status === "refunded";

	return (
		<View>
			<View style={styles.billBlock}>
				<Text style={styles.blockLabel}>Billed to</Text>
				<Text style={styles.blockName}>{studentName}</Text>
				<Text style={styles.blockText}>{studentEmail}</Text>
			</View>

			<View style={styles.tableHead}>
				<Text style={[styles.tableHeadCell, styles.colDesc]}>Description</Text>
				<Text style={[styles.tableHeadCell, styles.colAmount]}>Amount</Text>
			</View>
			<View style={styles.tableRow}>
				<View style={styles.colDesc}>
					<Text style={styles.itemTitle}>{courseTitle}</Text>
					<Text style={styles.itemSub}>Full course access · 1 license</Text>
				</View>
				<Text style={[styles.itemAmount, styles.colAmount]}>{amount}</Text>
			</View>

			<View style={styles.totals}>
				<View style={styles.totalsBox}>
					<View style={styles.totalsRow}>
						<Text style={styles.totalsLabel}>Subtotal</Text>
						<Text style={styles.totalsValue}>{amount}</Text>
					</View>
					<View style={styles.totalsRow}>
						<Text style={styles.totalsLabel}>Tax</Text>
						<Text style={styles.totalsValue}>
							{formatInvoiceAmount(0, currency)}
						</Text>
					</View>
					<View style={styles.grandRow}>
						<Text style={styles.grandLabel}>
							{isRefunded ? "Refunded" : "Total paid"}
						</Text>
						<Text style={styles.grandValue}>{amount}</Text>
					</View>
					{isRefunded && (
						<Text style={styles.refundNote}>
							This payment was refunded in full.
						</Text>
					)}
				</View>
			</View>
		</View>
	);
};
