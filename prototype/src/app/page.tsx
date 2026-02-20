import Link from "next/link";

import { SECTION_OPTIONS } from "@/lib/constants";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">
            Online Compliance Monitoring System
          </h1>
          <p className="max-w-3xl text-slate-300">
            Track section-based compliances, collect proof of completion, review
            submissions, and approve/disapprove with feedback through a single
            Supabase-powered workflow.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-600 px-5 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Open dashboard
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-xl font-semibold">Sections</h2>
          <p className="mt-1 text-sm text-slate-400">
            The system currently supports 8 sections:
          </p>
          <ul className="mt-4 grid gap-2 text-sm text-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {SECTION_OPTIONS.map((section) => (
              <li
                key={section.id}
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
              >
                Section {section.id} - {section.name}
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-4 text-sm text-slate-200 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h3 className="font-semibold">Admin capabilities</h3>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-slate-300">
              <li>Add admins/users and assign section ownership.</li>
              <li>Assign tasks to specific sections only.</li>
              <li>Review submitted compliances with feedback.</li>
              <li>Approve/disapprove submissions with full audit visibility.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h3 className="font-semibold">User capabilities</h3>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-slate-300">
              <li>Create own compliances and default recurring templates.</li>
              <li>Upload docs/images/videos as proof of progress.</li>
              <li>Submit complied assignments for admin review.</li>
              <li>Receive deadline and review-result notifications.</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
