# ReSource Management

Production-grade internal web application for a manufacturing facility to manage scrap and waste declarations, approvals, ledger entries, and live Excel reporting.

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15 running locally (or a connection URL)

### 1. Install dependencies

```bash
npm install          # root (concurrently)
npm --prefix server install
npm --prefix client install
```

### 2. Configure environment

```bash
cp server/.env.example server/.env
# Edit server/.env — set DATABASE_URL at minimum
```

Minimum required:
```
DATABASE_URL="postgresql://postgres:password@localhost:5432/resource_mgmt"
JWT_SECRET="any-long-random-string"
JWT_REFRESH_SECRET="another-long-random-string"
```

### 3. Set up the database

```bash
cd server
npx prisma migrate dev --name init    # creates tables
npx prisma db seed                    # creates default accounts
```

### 4. Run the app

```bash
npm run dev          # starts both server (port 4000) and client (port 5173)
```

Open: **http://localhost:5173**

---

## Default Accounts (after seed)

| Emp No  | Role              | Password      |
|---------|-------------------|---------------|
| EMP001  | Admin             | resource@123  |
| EMP002  | Facility Manager  | resource@123  |
| EMP003  | Dept Head         | resource@123  |
| EMP004  | Dept Head (BAT)   | resource@123  |
| EMP005  | Employee (SMT)    | resource@123  |

---

## Application Structure

```
resource-management/
  client/           React 18 + Vite + Tailwind + Recharts
  server/           Node.js + Express + Prisma + PostgreSQL
    prisma/         Schema + migrations + seed
    src/
      routes/       API route handlers
      services/     Business logic (declaration, ledger, excel, graph)
      middleware/   Auth, RBAC, validation, error handler
      jobs/         Nightly Excel export cron
```

---

## API Endpoints

Base: `http://localhost:4000/api/v1`

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/login | Login |
| POST | /auth/refresh | Refresh token |
| GET | /declarations | List declarations (filtered) |
| POST | /declarations | Create declaration |
| PATCH | /declarations/:id/submit | Submit draft |
| PATCH | /declarations/:id/approve | Approve (role-gated) |
| GET | /declarations/export/excel | Download Excel |
| GET | /dashboard/summary | KPI metrics |
| GET | /dashboard/ledger | Ledger data for charts |
| GET | /dashboard/trends | 30-day trend |
| GET | /live/ledger | Power Query endpoint |
| GET | /live/declarations | Power Query endpoint |
| GET | /live/summary | Power Query endpoint |
| GET | /admin/excel/export-log | Export history |

---

## Live Excel / Power Query

See **http://localhost:4000/powerquery-setup** for step-by-step instructions on connecting Excel's Power Query to the live data endpoints.

All `/live/*` endpoints return bare JSON arrays (Power Query compatible) and require a Bearer token header.

---

## Declaration Approval Flow

```
DRAFT → SUBMITTED → ZONE_APPROVED → DEPT_APPROVED → IREP_AUTHORIZED → SECURITY_AUTHORIZED → COMPLETED
```

When status reaches COMPLETED:
1. Ledger entries created for each line item
2. Excel report auto-generated
3. Action logged to audit_logs

---

## Tech Stack

- **Frontend**: React 18, React Router v6, Recharts, Tailwind CSS, Axios
- **Backend**: Node.js 20, Express.js, Prisma ORM, PostgreSQL 15
- **Auth**: JWT (8h access + 7d refresh)
- **Excel**: ExcelJS
- **Scheduling**: node-cron
- **Validation**: Zod (server), React Hook Form (client)

---

## Theme

Brand palette (Tailwind `brand.*` tokens in `client/tailwind.config.js`):

| Token | Hex | Use |
|-------|-----|-----|
| `brand.primary` | `#00838F` | primary teal — actions, links |
| `brand.cyan` | `#00A7B5` | secondary accent |
| `brand.lime` | `#7CB342` | recovery / recycling accent |
| `brand.dark` | `#10262A` | headers, dark surfaces |
| amber | `#FB8C00` | hazardous waste |
