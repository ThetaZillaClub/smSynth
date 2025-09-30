// app/settings/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsShell from "@/components/settings/SettingsShell";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      {/* Header aligned with the left edge of the settings card */}
      <div className="px-6 pt-8 pb-2 max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      {/* Centered settings card with internal sidebar + content */}
      <div className="px-6 pb-10 max-w-5xl mx-auto">
        <SettingsShell />
      </div>
    </div>
  );
}
