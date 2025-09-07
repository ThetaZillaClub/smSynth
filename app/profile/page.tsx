import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PrimaryHeader from "@/components/header/PrimaryHeader";
import UpdateDisplayName from "@/components/profile/UpdateDisplayName";
import MyModels from "@/components/profile/MyModels";

export default async function Profile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const displayName = user.user_metadata?.display_name || "";

  return (
    <>
      <PrimaryHeader />
      <div className="flex min-h-screen w-full flex-col items-center bg-[#f0f0f0] pt-20">
        <div className="w-full max-w-md p-8">
          <UpdateDisplayName initialDisplayName={displayName} />
          <MyModels />
        </div>
      </div>
    </>
  );
}