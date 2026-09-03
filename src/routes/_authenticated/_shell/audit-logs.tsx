import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "created_at",
    "label": "When",
    "format": "date"
  },
  {
    "key": "user_email",
    "label": "User"
  },
  {
    "key": "action",
    "label": "Action"
  },
  {
    "key": "module",
    "label": "Module",
    "format": "badge"
  },
  {
    "key": "record_id",
    "label": "Record"
  },
  {
    "key": "ip_address",
    "label": "IP"
  }
];

const fields: Field[] = [];

export const Route = createFileRoute("/_authenticated/_shell/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs — Daraven ERP" },
      { name: "description", content: "Immutable record of who changed what, and when." },
      { property: "og:title", content: "Audit Logs — Daraven ERP" },
      { property: "og:description", content: "Immutable record of who changed what, and when." },
    ],
  }),
  component: () => (
    <ResourcePage
      table="audit_logs"
      title="Audit Logs"
      description={"Immutable record of who changed what, and when."}
      columns={columns}
      fields={fields}
      searchKeys={["action","module","user_email"]}
      orderBy="created_at"
      readOnly
    />
  ),
});
