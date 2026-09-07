"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, LockKeyhole, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

type Status = "checking" | "ready" | "expired" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // A valid recovery link (via /auth/callback) leaves the user with a session.
    createBrowserClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        setStatus(session ? "ready" : "expired");
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await createBrowserClient().auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }
    setStatus("done");
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-violet-600/5 via-transparent to-transparent" />
      <Card className="w-full max-w-md relative z-10 bg-white/5 border-white/10 backdrop-blur-sm">
        {status === "checking" && (
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Verifying link...</CardTitle>
            <CardDescription>Hold on while we validate your reset link.</CardDescription>
          </CardHeader>
        )}

        {status === "expired" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center mb-4">
                <ShieldAlert className="h-6 w-6 text-white" />
              </div>
              <CardTitle className="text-2xl">Link expired</CardTitle>
              <CardDescription>
                This password reset link is invalid or has expired. Request a new one to continue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/forgot-password" className="block">
                <Button className="w-full bg-violet-600 hover:bg-violet-500">Request New Link</Button>
              </Link>
              <Link href="/login" className="block">
                <Button variant="ghost" className="w-full">
                  Back to sign in
                </Button>
              </Link>
            </CardContent>
          </>
        )}

        {status === "ready" && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center mb-4">
                <LockKeyhole className="h-6 w-6 text-white" />
              </div>
              <CardTitle className="text-2xl">Set New Password</CardTitle>
              <CardDescription>Choose a new password for your account.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-2 rounded-lg">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="bg-white/5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    className="bg-white/5"
                  />
                </div>
                <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-500" disabled={loading}>
                  {loading ? "Updating..." : "Update Password"}
                </Button>
              </CardContent>
            </form>
            <CardFooter className="flex justify-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-white transition-colors">
                Back to sign in
              </Link>
            </CardFooter>
          </>
        )}

        {status === "done" && (
          <CardHeader className="text-center">
            <div className="mx-auto h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-6 w-6 text-white" />
            </div>
            <CardTitle className="text-2xl">Password updated</CardTitle>
            <CardDescription>Taking you to your dashboard...</CardDescription>
          </CardHeader>
        )}
      </Card>
    </div>
  );
}
