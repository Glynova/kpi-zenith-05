# Optiva Business Suite

Build a production-ready SaaS web application called Daraven ERP with the tagline:

"Smarter Decisions. Better Performance."

Daraven ERP is an all-in-one Inventory, Financial, KPI, and Business Performance Management platform designed for all business types including retail stores, restaurants, wholesalers, pharmacies, manufacturers, distributors, service businesses, and SMEs.

==================================================

TECH STACK

==================================================

Use:

- React

- TypeScript

- Vite

- TailwindCSS

- shadcn/ui

- Supabase

- PostgreSQL

- React Query

- React Router

- Recharts

- Zod

- React Hook Form

- Framer Motion

The application must be fully responsive for desktop, tablet, and mobile.

Use a clean modern enterprise UI inspired by Stripe, Linear, Notion, and Vercel.

Use dark mode and light mode.

Use a collapsible sidebar.

Use reusable components.

Use a professional dashboard layout.

==================================================

MULTI-TENANT ARCHITECTURE

==================================================

Implement true multi-tenant architecture.

Every business must only access its own data.

Use Supabase Row Level Security (RLS).

Each account can:

- Create a business

- Join a business

- Own multiple businesses

- Switch businesses

Every table must contain:

business_id

Data isolation is mandatory.

==================================================

AUTHENTICATION

==================================================

Implement:

- Email and password authentication

- Google login

- Password reset

- Email verification

- Protected routes

- Session persistence

- Business onboarding flow

==================================================

ROLE BASED ACCESS CONTROL

==================================================

Create roles:

Owner

Admin

Manager

Accountant

Cashier

Inventory Staff

Warehouse Staff

Employee

Auditor

Permissions must be dynamic.

Only owners can manage permissions.

Implement page restrictions.

Implement action restrictions.

Implement read-only auditor mode.

==================================================

MODULES

==================================================

Create the following modules:

Dashboard

Products

Categories

Suppliers

Customers

Inventory

Purchase Orders

Sales

Invoices

Expenses

Cash Flow

Accounts Receivable

Accounts Payable

Payroll

Employees

Attendance

Bill of Materials

Reports

Notifications

Analytics

Settings

Audit Logs

==================================================

DASHBOARD

==================================================

Build a dynamic dashboard.

Display:

Today's Sales

Today's Expenses

Today's Profit

Monthly Revenue

Monthly Profit

Cash On Hand

Inventory Value

Outstanding Receivables

Outstanding Payables

Low Stock Items

Out Of Stock Items

Best Selling Products

Top Customers

Sales Growth

Expense Growth

Business Health Score

Recent Activities

Add:

Line charts

Bar charts

Pie charts

KPI cards

Date filters

Custom ranges

==================================================

PRODUCTS

==================================================

Products must contain:

SKU

Barcode

QR Code

Product Name

Description

Category

Brand

Unit

Supplier

Cost Price

Selling Price

Tax

Reorder Level

Image

Status

Expiration Date

Batch Number

Serial Number

Support:

Search

Filter

Pagination

Bulk Import CSV

Bulk Export CSV

Excel Export

==================================================

INVENTORY

==================================================

Inventory features:

Stock In

Stock Out

Adjustments

Returns

Damaged Stocks

Transfers

Warehouse Management

Inventory Movement Logs

Batch Tracking

Serial Tracking

Expiration Tracking

Automatically calculate:

Current Stock

Available Stock

Reserved Stock

Inventory Value

Create low-stock alerts.

Create out-of-stock alerts.

Create expiring product alerts.

==================================================

PURCHASE ORDERS

==================================================

Purchase order workflow:

Draft

Pending Approval

Approved

Ordered

Partially Received

Received

Completed

Cancelled

Support:

Multiple suppliers

Partial receiving

Automatic inventory updates

Supplier balances

Purchase history

Purchase analytics

==================================================

SALES

==================================================

Sales features:

Walk-in sales

Wholesale sales

Credit sales

Returns

Refunds

Discounts

Tax

Multiple payment methods

Receipts

Delivery receipts

Automatically update inventory.

Automatically update receivables.

==================================================

INVOICE GENERATOR

==================================================

Generate professional invoices.

Support:

Company logo

QR code

Barcode

Tax

VAT

Discounts

Due dates

Terms

Customer details

PDF download

Print invoice

Email invoice

==================================================

EXPENSES

==================================================

Expense categories:

Utilities

Rent

Payroll

Marketing

Fuel

Repairs

Supplies

Miscellaneous

Track:

Recurring expenses

One-time expenses

Approvals

Attachments

Expense analytics

==================================================

CASH FLOW

==================================================

Track:

Cash In

Cash Out

Opening Balance

Closing Balance

Generate:

Daily cash flow

Weekly cash flow

Monthly cash flow

Yearly cash flow

==================================================

ACCOUNTS RECEIVABLE

==================================================

Track:

Customer debts

Partial payments

Due dates

Remaining balance

Aging reports

Payment history

Create reminders.

==================================================

ACCOUNTS PAYABLE

==================================================

Track:

Supplier debts

Due dates

Partial payments

Remaining balances

Payment schedules

==================================================

EMPLOYEES

==================================================

Employee information:

Employee ID

Department

Position

Salary

Rate Type

Status

Contact Information

Emergency Contact

==================================================

ATTENDANCE

==================================================

Track:

Time In

Time Out

Overtime

Late

Undertime

Leaves

Absences

==================================================

PAYROLL

==================================================

Payroll features:

Salary

Daily Rate

Hourly Rate

Allowances

Deductions

Loans

Overtime

Holiday Pay

Payslips

Payroll History

Generate payroll reports.

==================================================

BILL OF MATERIALS

==================================================

Create Bill of Materials.

When finished goods are sold:

Automatically deduct ingredients.

Support:

Recipes

Manufacturing

Assemblies

Bundles

==================================================

KPI ANALYTICS

==================================================

Calculate:

Revenue

Gross Profit

Net Profit

Profit Margin

Expense Ratio

Inventory Turnover

Dead Stock

Sales Growth

Average Order Value

Customer Lifetime Value

Cash Flow Ratio

Current Ratio

ROI

Business Health Score

Allow custom KPIs.

==================================================

REPORTS

==================================================

Generate:

Sales Reports

Expense Reports

Inventory Reports

Profit Reports

Cash Flow Reports

Payroll Reports

Supplier Reports

Customer Reports

KPI Reports

Receivable Reports

Payable Reports

Export:

PDF

CSV

Excel

==================================================

NOTIFICATIONS

==================================================

Real-time notifications:

Low stock

Out of stock

Expiring products

Invoice due

Debt due

Payroll due

Purchase approval

Sales target achieved

==================================================

AUDIT LOGS

==================================================

Track:

User

Action

Date

Module

Old Value

New Value

IP Address

Audit logs cannot be edited.

==================================================

SETTINGS

==================================================

Allow businesses to customize:

Business logo

Business name

Currency

Tax rate

Timezone

Invoice template

Dark mode

Light mode

Brand colors

==================================================

DATABASE

==================================================

Create scalable PostgreSQL tables for:

businesses

users

user_businesses

roles

permissions

employees

attendance

customers

suppliers

categories

products

warehouses

inventory

inventory_movements

purchase_orders

purchase_order_items

sales

sale_items

invoices

expenses

cash_transactions

accounts_receivable

accounts_payable

payroll

bill_of_materials

bom_items

notifications

kpis

audit_logs

Create all relationships.

Create indexes.

Enable Row Level Security.

Create policies.

==================================================

UI REQUIREMENTS

==================================================

Use:

Minimal enterprise design

Professional typography

Large whitespace

Smooth animations

Responsive layouts

Accessible components

Consistent spacing

Skeleton loaders

Empty states

Error states

Confirmation dialogs

Toast notifications

==================================================

FINAL REQUIREMENT

==================================================

Build Daraven ERP as a scalable SaaS platform with production-ready architecture, clean code organization, reusable components, feature-based folders, proper TypeScript types, secure authentication, RLS policies, and an enterprise-grade user experience suitable for thousands of businesses.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c5cdce3b-6d7c-40eb-9e3a-30c3cb8fa501).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
