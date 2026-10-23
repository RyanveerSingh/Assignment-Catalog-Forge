import { redirect } from "next/navigation";
import { currentUser, userStores } from "@/lib/session";

export const dynamic = "force-dynamic";

/** `/app` is where sign-in lands: the merchant's first store, or the sign-in page when there is no session. */
export default async function AppHome() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const first = (await userStores(user.id))[0];
  if (!first) redirect("/login?error=no-store");
  redirect(`/app/${first.slug}/upload`);
}
