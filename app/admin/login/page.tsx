import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAdminSession } from "@/lib/admin/auth";
import { sendMagicLink } from "./actions";

export const metadata: Metadata = {
  title: "Admin sign in | DealStack AU",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  // Already-authenticated admins skip the form.
  if (await getAdminSession()) {
    redirect("/admin/dashboard");
  }

  const params = await searchParams;
  const sent = params.sent === "1";
  const error = params.error;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-3 text-center">
          <Logo />
          <div className="space-y-1">
            <CardTitle>Admin sign in</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a magic link.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <p
              role="status"
              className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
            >
              If that email can sign in, a magic link is on its way — check your
              inbox.
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <form action={sendMagicLink} className="space-y-3">
            <Input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              aria-label="Email address"
            />
            <Button type="submit" className="w-full">
              Send magic link
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">
            Manual admin access only. Access is restricted to allowlisted
            accounts.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
