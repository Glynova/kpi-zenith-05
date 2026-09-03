import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage, type Column, type Field } from "@/components/resource-page";

const columns: Column[] = [
  {
    "key": "work_date",
    "label": "Date",
    "format": "date"
  },
  {
    "key": "status",
    "label": "Status",
    "format": "badge"
  },
  {
    "key": "overtime_hours",
    "label": "OT hrs",
    "format": "number"
  },
  {
    "key": "late_minutes",
    "label": "Late (min)",
    "format": "number"
  },
  {
    "key": "undertime_minutes",
    "label": "Undertime (min)",
    "format": "number"
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
    "key": "work_date",
    "label": "Date",
    "type": "date"
  },
  {
    "key": "status",
    "label": "Status",
    "type": "select",
    "options": [
      "present",
      "late",
      "absent",
      "leave",
      "holiday",
      "rest_day"
    ],
    "default": "present"
  },
  {
    "key": "overtime_hours",
    "label": "Overtime hours",
    "type": "number",
    "default": 0
  },
  {
    "key": "late_minutes",
    "label": "Late minutes",
    "type": "number",
    "default": 0
  },
  {
    "key": "undertime_minutes",
    "label": "Undertime minutes",
    "type": "number",
    "default": 0
  },
  {
    "key": "notes",
    "label": "Notes",
    "type": "textarea"
  }
];

export const Route = createFileRoute("/_authenticated/_shell/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance — KPIOptiva" },
      { name: "description", content: "Time in, time out, overtime, late, undertime and leaves." },
      { property: "og:title", content: "Attendance — KPIOptiva" },
      { property: "og:description", content: "Time in, time out, overtime, late, undertime and leaves." },
    ],
  }),
  component: () => (
    <ResourcePage
      illustration="people"
      table="attendance"
      title="Attendance"
      description={"Time in, time out, overtime, late, undertime and leaves."}
      columns={columns}
      fields={fields}
      searchKeys={["status","notes"]}
      orderBy="work_date"
      
    />
  ),
});
