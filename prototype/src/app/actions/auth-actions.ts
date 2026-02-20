"use server";

import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const redirectToLoginError = (message: string) =>
  redirect(`/login?error=${encodeURIComponent(message)}`);

export async function signInAction(formData: FormData) {
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    redirectToLoginError("Email and password are required.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirectToLoginError(error.message);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirectToLoginError("Unable to load your account.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    redirectToLoginError("Profile not found. Contact an admin.");
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirectToLoginError("Your account is inactive.");
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function registerBootstrapAdminAction(formData: FormData) {
  const fullName = formData.get("full_name")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const password = formData.get("password")?.toString();

  if (!fullName || !email || !password) {
    redirectToLoginError("Full name, email, and password are required.");
  }

  if (password.length < 8) {
    redirectToLoginError("Password must be at least 8 characters long.");
  }

  const adminClient = createSupabaseAdminClient();
  const { count, error: countError } = await adminClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true);

  if (countError) {
    redirectToLoginError(countError.message);
  }

  if ((count ?? 0) > 0) {
    redirectToLoginError(
      "Initial setup is complete. Ask an admin to create your account.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    redirectToLoginError(error.message);
  }

  redirect(
    "/login?success=Bootstrap+admin+registered.+Sign+in+with+your+credentials.",
  );
}
