"use client";

import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gauge, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";

const VALID_PLANS = ["pro", "ai_premium"] as const;

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const [plan] = useState(() =>
    VALID_PLANS.includes(planParam as (typeof VALID_PLANS)[number]) ? planParam : null
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createBrowserClient();
    const nextPath = plan ? `/settings?plan=${plan}` : "/dashboard";
    // A DB trigger mirrors auth.users into public.users — no client-side insert.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }
    if (data.session) {
      router.push(nextPath);
      router.refresh();
      return;
    }
    // Email confirmation enabled: user created but no session yet.
    setAwaitingConfirmation(true);
    setLoading(false);
  }

  if (awaitingConfirmation) {
    return (
      <Card className="w-full max-w-md relative z-10 bg-white/5 border-white/10 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto h-10 w-10 rounded-xl bg-primary flex items-center justify-center mb-4">
            <MailCheck className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            We sent a confirmation link to <span className="text-primary">{email}</span>. Click it to activate
            your account.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-white transition-colors">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md relative z-10 bg-white/5 border-white/10 backdrop-blur-sm">
      <CardHeader className="text-center">
        <div className="mx-auto h-10 w-10 rounded-xl bg-primary flex items-center justify-center mb-4">
          <Gauge className="h-6 w-6 text-white" />
        </div>
        <CardTitle className="text-2xl">Create Account</CardTitle>
        <CardDescription>
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSignup}>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-2 rounded-lg">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required className="bg-white/5" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-white/5" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="bg-white/5" />
          </div>
          <Button type="submit" className="w-full bg-primary hover:bg-primary" disabled={loading}>
            {loading ? "Creating Account..." : "Create Account"}
          </Button>
        </CardContent>
      </form>
      <CardFooter className="flex justify-center">
        <Link href="/" className="text-sm text-muted-foreground hover:text-white transition-colors">
          Back to home
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
