import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    key: "employee_code",
    label: "ID",
  },
  {
    key: "full_name",
    label: "Name",
  },
  {
    key: "department",
    label: "Department",
  },
  {
    key: "position",
    label: "Position",
  },
  {
    key: "rate_type",
    label: "Rate",
    format: "badge",
  },
  {
    key: "salary",
    label: "Salary",
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
    key: "full_name",
    label: "Full name",
    type: "text",
    required: true,
  },
  {
    key: "employee_code",
    label: "Employee ID",
    type: "text",
  },
  {
    key: "department",
    label: "Department",
    type: "text",
  },
  {
    key: "position",
    label: "Position",
    type: "text",
  },
  {
    key: "rate_type",
    label: "Rate type",
    type: "select",
    options: ["monthly", "daily", "hourly"],
    default: "monthly",
  },
  {
    key: "salary",
    label: "Salary / rate",
    type: "number",
    default: 0,
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["active", "on_leave", "suspended", "resigned"],
    default: "active",
  },
  {
    key: "hire_date",
    label: "Hire date",
    type: "date",
  },
  {
    key: "email",
    label: "Email",
    type: "text",
  },
  {
    key: "phone",
    label: "Phone",
    type: "text",
  },
  {
    key: "emergency_contact",
    label: "Emergency contact",
    type: "text",
  },
  {
    key: "emergency_phone",
    label: "Emergency phone",
    type: "text",
  },
  {
    key: "address",
    label: "Address",
    type: "textarea",
  },
];

export const Route = createFileRoute("/_authenticated/_shell/employees")({
  head: () => ({
    meta: [
      { title: "Employees — Daraven ERP" },
      { name: "description", content: "Staff records, departments, rates and emergency contacts." },
      { property: "og:title", content: "Employees — Daraven ERP" },
      {
        property: "og:description",
        content: "Staff records, departments, rates and emergency contacts.",
      },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="people"
      table="employees"
      title="Employees"
      description={"Staff records, departments, rates and emergency contacts."}
      columns={columns}
      fields={fields}
      searchKeys={["full_name", "employee_code", "department", "position"]}
      orderBy="created_at"
    />
  ),
});
