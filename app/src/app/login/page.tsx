import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Insight Pitch" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
