import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/auth/card";
import AuthHeader from "@/components/header/AuthHeader";

export default function Page() {
  return (
    <>
      <AuthHeader />
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-[#f0f0f0]">
        <div className="w-full max-w-sm">
          <div className="flex flex-col gap-6">
            <Card className="bg-[#f0f0f0] border-[#d7d7d7]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#0f0f0f]">
                  Thank you for signing up!
                </CardTitle>
                <CardDescription className="text-[#2d2d2d]">Check your email to confirm</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#373737]">
                  You&apos;ve successfully signed up. Please check your email to
                  confirm your account before signing in.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}