import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/setup-notice";

export default async function Home() {
  const supabase = await createClient();
  if (!supabase) return <SetupNotice />;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
