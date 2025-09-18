import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PrimaryHeader from "@/components/header/PrimaryHeader";
import UpdateDisplayName from "@/components/profile/UpdateDisplayName";
import MyStudents from "@/components/profile/MyStudents";

export default async function Profile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const displayName = user.user_metadata?.display_name || "";

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-b from-[#f0f0f0] to-[#d2d2d2] text-[#0f0f0f]">
      <PrimaryHeader />
      <div className="flex-1 w-full flex flex-col items-center pt-20">
        <div className="w-full max-w-md p-8">
          <UpdateDisplayName initialDisplayName={displayName} />
          <MyStudents />
        </div>
      </div>
    </div>
  );
}
