import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { QrCode } from "lucide-react";
import { useState } from "react";

import { QrPhPaymentDialog } from "@/components/qrph-payment-dialog";
import { ResourcePage, type Column, type Field } from "@/components/resource-page";
import { Button } from "@/components/ui/button";

const columns: Column[] = [
  {
    key: "invoice_number",
    label: "Invoice #",
  },
  {
    key: "issue_date",
    label: "Issued",
    format: "date",
  },
  {
    key: "due_date",
    label: "Due",
    format: "date",
  },
  {
    key: "total",
    label: "Total",
    format: "currency",
  },
  {
    key: "paid",
    label: "Paid",
    format: "currency",
  },
  {
    key: "status",
    label: "Status",
    format: "badge",
  },
];

const fields: Field[] = [
  {
    key: "invoice_number",
    label: "Invoice number",
    type: "text",
    required: true,
  },
  {
    key: "customer_id",
    label: "Customer",
    type: "relation",
    relation: {
      table: "customers",
    },
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["draft", "unpaid", "partial", "paid", "overdue", "cancelled"],
    default: "unpaid",
  },
  {
    key: "issue_date",
    label: "Issue date",
    type: "date",
  },
  {
    key: "due_date",
    label: "Due date",
    type: "date",
  },
  {
    key: "subtotal",
    label: "Subtotal",
    type: "number",
    default: 0,
  },
  {
    key: "discount",
    label: "Discount",
    type: "number",
    default: 0,
  },
  {
    key: "tax",
    label: "Tax / VAT",
    type: "number",
    default: 0,
  },
  {
    key: "total",
    label: "Total",
    type: "number",
    default: 0,
  },
  {
    key: "paid",
    label: "Amount paid",
    type: "number",
    default: 0,
  },
  {
    key: "terms",
    label: "Terms",
    type: "textarea",
  },
  {
    key: "notes",
    label: "Notes",
    type: "textarea",
  },
];

export const Route = createFileRoute("/_authenticated/_shell/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — Daraven ERP" },
      {
        name: "description",
        content: "Issue professional invoices with due dates, tax and terms.",
      },
      { property: "og:title", content: "Invoices — Daraven ERP" },
      {
        property: "og:description",
        content: "Issue professional invoices with due dates, tax and terms.",
      },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const [qrFor, setQrFor] = useState<string | null>(null);
  const queryClient = useQueryClient();
  return (
    <>
      <ResourcePage
        illustration="sales"
        table="invoices"
        title="Invoices"
        description={"Issue professional invoices with due dates, tax and terms."}
        columns={columns}
        fields={fields}
        searchKeys={["invoice_number", "status"]}
        orderBy="issue_date"
        rowActions={(row) =>
          !["paid", "cancelled", "voided", "draft"].includes(String(row.status)) &&
          row.document_status !== "void" &&
          Number(row.total ?? 0) - Number(row.paid ?? 0) >= 1 ? (
            <Button
              size="sm"
              variant="outline"
              aria-label="Collect payment with QR Ph"
              onClick={() => setQrFor(String(row.id))}
            >
              <QrCode className="size-4" /> QR Ph
            </Button>
          ) : null
        }
      />
      {qrFor && (
        <QrPhPaymentDialog
          invoiceId={qrFor}
          open={!!qrFor}
          onOpenChange={(o) => !o && setQrFor(null)}
          onPaid={() => queryClient.invalidateQueries({ queryKey: ["resource", "invoices"] })}
        />
      )}
    </>
  );
}
