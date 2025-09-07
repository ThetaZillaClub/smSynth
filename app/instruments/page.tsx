// app/instruments/page.tsx
export const dynamic = "force-dynamic"; // avoid static caching while debugging

import { createClient } from "@/utils/supabase/server";

export default async function Instruments() {
  const supabase = await createClient();

  const { data, error, count } = await supabase
    .from("instruments")
    .select("*", { count: "exact" });

  if (error) {
    return <pre>ERROR: {error.message}</pre>;
  }

  return (
    <pre>
      {`count: ${count}\n`}
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
