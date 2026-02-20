"use server";

import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const redirectToLoginError = (message: string) =>
  redirect(`/login?error=${encodeURIComponent(message)}`);

const readRequiredField = (
  value: FormDataEntryValue | null,
  fieldName: string,
): string => {
  const normalized = value?.toString().trim();
  if (!normalized) {
    redirectToLoginError(`${fieldName} is required.`);
  }
  return normalized as string;
};

export async function signInAction(formData: FormData) {
  const email = readRequiredField(formData.get("email"), "Email");
  const password = readRequiredField(formData.get("password"), "Password");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirectToLoginError(error.message);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";

  if (!userId) {
    redirectToLoginError("Unable to load your account.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .single();
  const isActive = profile?.is_active;

  if (profileError || typeof isActive !== "boolean") {
    await supabase.auth.signOut();
    redirectToLoginError("Profile not found. Contact an admin.");
  }

  if (!isActive) {
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
  const fullName = readRequiredField(formData.get("full_name"), "Full name");
  const email = readRequiredField(formData.get("email"), "Email");
  const password = readRequiredField(formData.get("password"), "Password");

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
