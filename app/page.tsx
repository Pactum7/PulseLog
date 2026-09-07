import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { Discover } from "@/components/discover";

export default async function Home() {
  if (!(await isAuthenticated())) redirect("/login");
  return <Discover />;
}
