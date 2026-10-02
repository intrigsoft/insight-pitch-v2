import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/AuthShell";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "Create an account · Insight Pitch" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
