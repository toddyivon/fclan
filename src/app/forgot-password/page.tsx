"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, MailCheck } from "lucide-react";
import Link from "next/link";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await createBrowserClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    // Always show the same confirmation — never reveal whether the email exists.
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-violet-600/5 via-transparent to-transparent" />
      <Card className="w-full max-w-md relative z-10 bg-white/5 border-white/10 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center mb-4">
            {sent ? <MailCheck className="h-6 w-6 text-white" /> : <KeyRound className="h-6 w-6 text-white" />}
          </div>
          <CardTitle className="text-2xl">{sent ? "Check your email" : "Reset Password"}</CardTitle>
          <CardDescription>
            {sent
              ? "If an account exists for that email, we've sent a link to reset your password."
              : "Enter your email and we'll send you a reset link."}
          </CardDescription>
        </CardHeader>
        {!sent && (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-white/5"
                />
              </div>
              <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-500" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            </CardContent>
          </form>
        )}
        <CardFooter className="flex justify-center">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-white transition-colors">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
