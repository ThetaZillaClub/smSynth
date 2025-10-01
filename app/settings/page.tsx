// app/settings/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsShell from "@/components/settings/SettingsShell";

function pickDisplayName(user: { user_metadata?: any; email?: string | null }) {
  const dn = user?.user_metadata?.display_name;
  if (typeof dn === "string" && dn.trim()) return dn.trim();
  return user?.email?.split("@")?.[0] ?? "You";
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Single-student model: one latest row
  const { data: row } = await supabase
    .from("models")
    .select("id, image_path, creator_display_name")
    .eq("uid", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const bootstrap = {
    uid: user.id,
    displayName: pickDisplayName(user),
    avatarPath: (user.user_metadata?.avatar_path as string | undefined) ?? null,
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
