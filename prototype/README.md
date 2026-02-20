# Online Compliance Monitoring System (Supabase + Next.js)

This project implements an online compliance monitoring system with:

- **Admin and User roles**
- **Section-based assignment and tracking**
- **Submission review workflow (approve/disapprove + feedback)**
- **Notifications (assignment, review result, deadline-near)**
- **File uploads (docs/images/videos) as progress/completion proof**
- **User default recurring compliances (daily/weekly/monthly)**

## Sections Covered

1. Admin  
2. Intelligence  
3. Operation  
4. Logistics  
5. PRC  
6. Finance  
7. Investigation  
10. IT

## Tech Stack

- Next.js (App Router, TypeScript)
- Supabase Auth + PostgreSQL + Storage
- Tailwind CSS

## 1) Environment Setup

Copy `.env.example` to `.env.local` and fill values:

```bash
cp .env.example .env.local
```

Required variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

> `SUPABASE_SERVICE_ROLE_KEY` is used on server actions for admin account creation and managed updates.

## 2) Database & Storage Setup (Supabase SQL)

Run the SQL migration in your Supabase SQL editor:

`supabase/migrations/0001_compliance_monitoring_schema.sql`

This migration creates:

- enums + normalized tables (`profiles`, `tasks`, `submissions`, etc.)
- section seeds
- recurring default section templates (daily/weekly/monthly)
- triggers for:
  - assignment notifications
  - admin notifications for submitted work
  - user notifications for approval/disapproval
- function for deadline notifications (`create_deadline_notifications`)
- RLS policies for all core tables
- `proof-files` storage bucket + policies

## 3) Run Locally

```bash
npm install
npm run dev
```

Open: http://localhost:3000

## 4) Authentication / Bootstrapping

- Visit `/login`.
- Use **“Initial setup only: create first admin account”** once on a fresh database.
- First registered account is automatically promoted to `admin`.
- After initial setup, admins create users/admins from the dashboard.

## 5) Main Workflows

### Admin

- Add admin/user accounts
- Assign users to sections
- Deactivate/remove users
- Assign section tasks
- Assign section default recurring tasks in bulk
- Review submissions (approve/disapprove + feedback)
- View who submitted and from what section

### User

- Create own compliance tasks
- Set default daily/weekly/monthly templates
- Create task from defaults
- Update progress and upload evidence files
- Submit complied tasks for admin review
- Receive review and deadline notifications

## Notes

- Deadline notifications are generated via `create_deadline_notifications` and triggered on dashboard load.
- For production-scale scheduling, run this function periodically with Supabase cron/jobs.
