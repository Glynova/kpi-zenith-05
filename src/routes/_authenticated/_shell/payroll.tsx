import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "period_start",
    "label": "From",
    "format": "date"
  },
  {
    "key": "period_end",
    "label": "To",
    "format": "date"
  },
  {
    "key": "basic_pay",
    "label": "Basic",
    "format": "currency"
  },
  {
    "key": "overtime_pay",
    "label": "Overtime",
    "format": "currency"
  },
  {
    "key": "deductions",
    "label": "Deductions",
    "format": "currency"
  },
  {
    "key": "net_pay",
    "label": "Net pay",
    "format": "currency"
  },
  {
    "key": "status",
    "label": "Status",
    "format": "badge"
  }
];

const fields: Field[] = [
  {
    "key": "employee_id",
    "label": "Employee",
    "type": "relation",
    "relation": {
      "table": "employees",
      "labelKey": "full_name"
    },
    "required": true
  },
  {
    "key": "period_start",
    "label": "Period start",
    "type": "date",
    "required": true
  },
  {
    "key": "period_end",
    "label": "Period end",
    "type": "date",
    "required": true
  },
  {
    "key": "basic_pay",
    "label": "Basic pay",
    "type": "number",
    "default": 0
  },
  {
    "key": "overtime_pay",
    "label": "Overtime pay",
    "type": "number",
    "default": 0
  },
  {
    "key": "holiday_pay",
    "label": "Holiday pay",
    "type": "number",
    "default": 0
  },
  {
    "key": "allowances",
    "label": "Allowances",
    "type": "number",
    "default": 0
  },
  {
    "key": "deductions",
    "label": "Deductions",
    "type": "number",
    "default": 0
  },
  {
    "key": "loans",
    "label": "Loans",
    "type": "number",
    "default": 0
  },
  {
    "key": "net_pay",
    "label": "Net pay",
    "type": "number",
    "default": 0
  },
  {
    "key": "status",
    "label": "Status",
    "type": "select",
    "options": [
      "draft",
      "approved",
      "paid"
    ],
    "default": "draft"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/payroll")({
  head: () => ({
    meta: [
      { title: "Payroll — KPIOptiva" },
      { name: "description", content: "Pay runs with allowances, deductions, loans and net pay." },
      { property: "og:title", content: "Payroll — KPIOptiva" },
      { property: "og:description", content: "Pay runs with allowances, deductions, loans and net pay." },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="people"
      table="payroll"
      title="Payroll"
      description={"Pay runs with allowances, deductions, loans and net pay."}
      columns={columns}
      fields={fields}
      searchKeys={["status"]}
      orderBy="period_end"
      
    />
  ),
});
