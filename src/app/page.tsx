import { redirect } from "next/navigation";
import { currentUser, userStores } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home(): Promise<never> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const stores = await userStores(user.id);
  if (stores.length === 0) redirect("/login?error=no-store");
  redirect(`/app/${stores[0]!.slug}/upload`);
}
