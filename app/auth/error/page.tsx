import { Card, CardContent, CardHeader, CardTitle } from "@/components/auth/card";
import AuthHeader from "@/components/auth/AuthHeader";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <AuthHeader />
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-[#f0f0f0]">
        <div className="w-full max-w-sm">
          <div className="flex flex-col gap-6">
            <Card className="bg-[#f0f0f0] border-[#d7d7d7]">
              <CardHeader>
                <CardTitle className="text-2xl text-[#0f0f0f]">
                  Sorry, something went wrong.
                </CardTitle>
              </CardHeader>
              <CardContent>
                {params?.error ? (
                  <p className="text-sm text-[#373737]">
                    Code error: {params.error}
                  </p>
                ) : (
                  <p className="text-sm text-[#373737]">
                    An unspecified error occurred.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}