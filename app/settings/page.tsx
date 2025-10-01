// app/settings/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsShell from "@/components/settings/SettingsShell";

function pickDisplayNameFromEmail(email?: string | null) {
  return email?.split("@")?.[0] ?? "You";
}

export default async function SettingsPage() {
  const supabase = await createClient();

  // ✅ No network call: reads JWT claims from cookies
  const { data } = await supabase.auth.getClaims();
  const uid = (data?.claims?.sub as string | undefined) ?? null;
  const email = (data?.claims?.email as string | undefined) ?? null;

  if (!uid) redirect("/auth/login");

  // Single-student model: one latest row
  const { data: row } = await supabase
    .from("models")
    .select("id, image_path, creator_display_name")
    .eq("uid", uid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const bootstrap = {
    uid,
    displayName: pickDisplayNameFromEmail(email),
    // We skip user_metadata here to avoid /auth/v1/user. Client will hydrate avatar_path if present.
    avatarPath: null,
    studentImagePath: row?.image_path ?? null,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <div className="px-6 pt-8 pb-2 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>
      <div className="px-6 pb-10 max-w-5xl mx-auto">
        <SettingsShell bootstrap={bootstrap} />
      </div>
    </div>
  );
}
