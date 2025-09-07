import { UpdatePasswordForm } from "@/components/update-password-form";
import AuthHeader from "@/components/header/AuthHeader";

export default function Page() {
  return (
    <>
      <AuthHeader />
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-[#f0f0f0]">
        <div className="w-full max-w-sm text-[#0f0f0f]">
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-12 text-center">Reset Your Password</h1>
          <UpdatePasswordForm />
        </div>
      </div>
    </>
  );
}