"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gauge } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient as createBrowserClient } from "@/lib/supabase/browser";
import { safeRedirect } from "@/lib/auth/safe-redirect";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: authError } = await createBrowserClient().auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const redirectTo = safeRedirect(params.get("redirectedFrom"));
    router.push(redirectTo);
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-violet-600/5 via-transparent to-transparent" />
      <Card className="w-full max-w-md relative z-10 bg-white/5 border-white/10 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center mb-4">
            <Gauge className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <CardDescription>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-violet-400 hover:underline">
              Sign up
            </Link>
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm px-4 py-2 rounded-lg">
                {error}
              </div>
            )}
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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-white/5"
              />
            </div>
            <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-500" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </CardContent>
        </form>
        <CardFooter className="flex justify-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-white transition-colors">
            Back to home
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
