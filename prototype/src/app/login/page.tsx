import Link from "next/link";
import { redirect } from "next/navigation";

import {
  registerBootstrapAdminAction,
  signInAction,
} from "@/app/actions/auth-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const resolvedParams = await Promise.resolve(searchParams ?? {});
  const errorMessage = Array.isArray(resolvedParams.error)
    ? resolvedParams.error[0]
    : resolvedParams.error;
  const successMessage = Array.isArray(resolvedParams.success)
    ? resolvedParams.success[0]
    : resolvedParams.success;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">
          Use the account created by your administrator.
        </p>

        {errorMessage ? (
          <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            {successMessage}
          </p>
        ) : null}

        <form action={signInAction} className="mt-4 space-y-3">
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Password"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          First account in a fresh database is auto-promoted to Admin.
        </p>
        <details className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-300">
            Initial setup only: create first admin account
          </summary>
          <form action={registerBootstrapAdminAction} className="mt-3 space-y-2">
            <input
              name="full_name"
              required
              placeholder="Full name"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
            />
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Password"
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
            />
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Create bootstrap admin
            </button>
          </form>
        </details>
        <p className="mt-1 text-center text-xs text-slate-500">
          <Link href="/" className="hover:text-slate-300">
            Back to system overview
          </Link>
        </p>
      </div>
    </main>
  );
}
