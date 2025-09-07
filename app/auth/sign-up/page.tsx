import { SignUpForm } from "@/components/sign-up-form";
import Link from 'next/link';
import AuthHeader from "@/components/header/AuthHeader";

export default function Page() {
  return (
    <>
      <AuthHeader />
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-[#f0f0f0]">
        <div className="w-full max-w-sm text-[#0f0f0f]">
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-12 text-center">Create Your Account</h1>
          <SignUpForm />
          <p className="mt-6 text-sm text-[#2d2d2d] text-center">
            Already have an account? <Link href="/auth/login" className="underline underline-offset-4 hover:opacity-80">Sign In</Link>
          </p>
          <footer className="pb-8 max-w-xs mx-auto text-xs text-center text-[#373737] mt-6">
            By creating an account, you agree to smSynth&apos;s Terms of Service and Privacy Policy.
          </footer>
        </div>
      </div>
    </>
  );
}