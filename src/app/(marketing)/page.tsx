"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Gauge, Brain, Trophy, Zap, Shield, Smartphone, ChevronRight, Star, Menu, X } from "lucide-react";
import Link from "next/link";

const fadeInUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.6, ease: "easeOut" },
};

const staggerContainer = {
  whileInView: { transition: { staggerChildren: 0.15 } },
};

const tiers = [
  {
    name: "Free",
    price: "$0",
    description: "Start capturing your GT7 telemetry data",
    features: ["Live speed & RPM view", "7-day session history", "Basic charts", "1 API key", "Mobile app capture"],
    cta: "Get Started",
    href: "/signup",
    trial: false,
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$9.99",
    period: "/mo",
    description: "Everything you need to get faster",
    features: [
      "Unlimited session history",
      "AI lap analysis (50/mo)",
      "Lap comparison overlay",
      "Interactive track maps",
      "5 API keys",
      "Tire temperature analytics",
      "Telemetry export (CSV/JSON)",
    ],
    cta: "Start Free Trial",
    href: "/signup?plan=pro",
    trial: true,
    highlighted: true,
  },
  {
    name: "AI Premium",
    price: "$24.99",
    period: "/mo",
    description: "Unlock the full power of AI coaching",
    features: [
      "Everything in Pro",
      "Advanced AI coaching",
      "Ghost lap generation",
      "Predictive tire & fuel strategy",
      "Real-time AI suggestions",
      "Unlimited API keys",
      "Unlimited AI analyses",
      "Priority queue",
    ],
    cta: "Go Premium",
    href: "/signup?plan=ai_premium",
    trial: true,
    highlighted: false,
  },
];

const features = [
  { icon: Smartphone, title: "Capture on Your Phone", description: "Point your phone at the screen and capture GT7 telemetry via your local WiFi network." },
  { icon: Gauge, title: "Live Telemetry Dashboard", description: "Watch your speed, RPM, gear, throttle, and brake data update in real-time." },
  { icon: Brain, title: "AI-Powered Analysis", description: "Get personalized lap-by-lap coaching from AI that finds where you lose time." },
  { icon: Trophy, title: "Lap Comparison", description: "Overlay your fastest lap against your latest attempt to see the delta." },
  { icon: Zap, title: "Instant Feedback", description: "See suggestions immediately after each session — no waiting for processing." },
  { icon: Shield, title: "Secure & Private", description: "Your data is encrypted and scoped to your account. We never share your telemetry." },
];

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Navigation */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[#0A0A0A]/80 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <motion.div className="flex items-center gap-2" whileHover={{ scale: 1.05 }}>
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Gauge className="h-5 w-5" />
            </div>
            <span className="font-bold text-xl tracking-tight">fclan</span>
          </motion.div>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
            <Link href="#features" className="hover:text-white transition-colors">Features</Link>
            <Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
            <Link href="/signup">
              <Button size="sm" className="bg-primary hover:bg-primary/90">
                Get Started
              </Button>
            </Link>
          </div>
          <button
            type="button"
            className="md:hidden -mr-2 p-2 text-white/70 hover:text-white transition-colors"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#0A0A0A]/95 px-6 py-4 flex flex-col gap-4 text-sm text-white/60">
            <Link href="#features" className="hover:text-white transition-colors" onClick={() => setMobileOpen(false)}>
              Features
            </Link>
            <Link href="#pricing" className="hover:text-white transition-colors" onClick={() => setMobileOpen(false)}>
              Pricing
            </Link>
            <Link href="/login" className="hover:text-white transition-colors" onClick={() => setMobileOpen(false)}>
              Sign In
            </Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)}>
              <Button size="sm" className="w-full bg-primary hover:bg-primary/90">
                Get Started
              </Button>
            </Link>
          </div>
        )}
      </motion.nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-20 md:pt-44 md:pb-32 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative mx-auto max-w-4xl text-center"
        >
          <Badge variant="outline" className="mb-6 border-primary/40 text-primary px-4 py-1">
            Live telemetry capture — 60Hz from your PS5
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1]">
            Drive Faster with{" "}
            <span className="text-primary">
              fclan
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
            Capture your Gran Turismo 7 telemetry data from your phone, analyze every lap with AI, and find exactly where you lose time.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-base px-8 h-12 animate-pulse-glow">
                Start Free <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="#pricing">
              <Button size="lg" variant="outline" className="border-white/20 hover:bg-white/10 text-base px-8 h-12">
                View Pricing
              </Button>
            </Link>
          </div>
          <div className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-white/50">
            <span><span className="font-mono tabular-nums text-primary">60Hz</span> capture rate</span>
            <span><span className="font-mono tabular-nums text-primary">20ms</span> packet latency</span>
            <span><span className="font-mono tabular-nums text-primary">3</span> tracks analyzed</span>
            <span><span className="font-mono tabular-nums text-primary">AI</span> coaching every lap</span>
          </div>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 md:py-28 px-6">
        <motion.div initial="initial" whileInView="whileInView" variants={fadeInUp} className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold">Everything You Need to Get Faster</h2>
          <p className="mt-4 text-lg text-white/60 max-w-xl mx-auto">
            From raw telemetry capture to AI-powered lap coaching — all in one platform.
          </p>
        </motion.div>
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="whileInView"
          viewport={{ once: true }}
          className="mx-auto max-w-6xl grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((f, i) => (
            <motion.div key={i} variants={fadeInUp}>
              <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-all duration-300 h-full">
                <CardContent className="pt-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4">
                    <f.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                  <p className="text-white/60 text-sm leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <Separator className="bg-white/10 max-w-6xl mx-auto" />

      {/* Pricing */}
      <section id="pricing" className="py-20 md:py-28 px-6">
        <motion.div initial="initial" whileInView="whileInView" variants={fadeInUp} className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold">Choose Your Plan</h2>
          <p className="mt-4 text-lg text-white/60 max-w-xl mx-auto">
            Start free, upgrade when you&apos;re ready to get serious.
          </p>
        </motion.div>
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="whileInView"
          viewport={{ once: true, amount: 0.1 }}
          className="mx-auto max-w-5xl grid md:grid-cols-3 gap-6 md:gap-8"
        >
          {tiers.map((t, i) => (
            <motion.div key={i} variants={fadeInUp}>
              <Card
                className={`h-full relative transition-all duration-300 ${
                  t.highlighted
                    ? "border-primary shadow-lg shadow-primary/20 bg-primary/10"
                    : "bg-white/5 border-white/10"
                }`}
              >
                {t.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary hover:bg-primary/90">
                      <Star className="inline h-3 w-3 mr-1" /> Recommended
                    </Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl">{t.name}</CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={`flex items-baseline gap-1 ${t.trial ? "mb-1" : "mb-6"}`}>
                    <span className="text-4xl font-bold">{t.price}</span>
                    {t.period && <span className="text-white/60">{t.period}</span>}
                  </div>
                  {t.trial && (
                    <p className="text-xs text-primary mb-6">7-day free trial — cancel anytime</p>
                  )}
                  <ul className="space-y-3">
                    {t.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm">
                        <svg className="h-4 w-4 mt-0.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className={t.highlighted ? "text-white/80" : "text-white/60"}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Link href={t.href} className="w-full">
                    <Button
                      className={`w-full ${t.highlighted ? "bg-primary hover:bg-primary/90" : "bg-white/10 hover:bg-white/20 text-white"}`}
                    >
                      {t.cta}
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="mx-auto max-w-3xl text-center rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/20 to-transparent p-12 md:p-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Find Your Fastest Lap?</h2>
          <p className="text-white/60 mb-8 max-w-lg mx-auto">
            Download the app, point your phone at the PlayStation, and start capturing telemetry data in under 60 seconds.
          </p>
          <Link href="/signup">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-base px-8 h-12">
              Get Started Free <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
              <Gauge className="h-4 w-4 text-white" />
            </div>
            <span>fclan</span>
          </div>
          <p>&copy; 2026 fclan. Not affiliated with Polyphony Digital or Sony.</p>
        </div>
      </footer>
    </div>
  );
}
