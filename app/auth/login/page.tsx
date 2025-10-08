import { LoginForm } from "@/components/auth/login-form";
import Link from 'next/link';
import AuthHeader from "@/components/auth/AuthHeader";

export default function Page() {
  return (
    <>
      <AuthHeader />
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-[#f0f0f0]">
        <div className="w-full max-w-sm text-[#0f0f0f]">
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-12 text-center">Welcome Back</h1>
          <LoginForm />
          <p className="mt-6 text-sm text-[#2d2d2d] text-center">
            Don’t have an account? <Link href="/auth/sign-up" className="underline underline-offset-4 hover:opacity-80">Sign Up</Link>
          </p>
        </div>
      </div>
    </>
  );
}