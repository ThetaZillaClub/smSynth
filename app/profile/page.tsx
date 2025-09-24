// app/profile/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PrimaryHeaderServer from "@/components/header/PrimaryHeaderServer";
import UpdateDisplayName from "@/components/profile/UpdateDisplayName";
import MyStudents from "@/components/profile/MyStudents";

export default async function Profile() {
  const supabase = await createClient();

  // One server fetch for this page; middleware already guaranteed auth.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const displayName = (user.user_metadata as any)?.display_name ?? "";

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      {/* Server header derives auth from JWT (no network) */}
      <PrimaryHeaderServer />
      <div className="flex-1 w-full flex flex-col items-center pt-20">
        <div className="w-full max-w-md p-8">
          {/* Seed the client with the current display name */}
          <UpdateDisplayName initialDisplayName={displayName} />
          <MyStudents />
        </div>
      </div>
    </div>
  );
}
