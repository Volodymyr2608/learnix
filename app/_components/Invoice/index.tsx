import { Document, Page } from "@react-pdf/renderer";
import { InvoiceBody } from "./components/InvoiceBody";
import { InvoiceFooter } from "./components/InvoiceFooter";
import { InvoiceHeader } from "./components/InvoiceHeader";
import { styles } from "./styles";
import type { InvoiceProps } from "./types";

export const InvoiceDocument = (props: InvoiceProps) => {
	return (
		<Document>
			<Page size="A4" style={styles.page}>
				<InvoiceHeader />
				<InvoiceBody
					amountCents={props.amountCents}
					courseTitle={props.courseTitle}
					currency={props.currency}
					status={props.status}
					studentEmail={props.studentEmail}
					studentName={props.studentName}
				/>
				<InvoiceFooter
					paymentId={props.paymentId}
					purchasedAt={props.purchasedAt}
				/>
			</Page>
		</Document>
	);
};
