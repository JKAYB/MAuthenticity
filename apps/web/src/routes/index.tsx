import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles, Activity, Lock, Zap } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { enableLiveDemo } from "@/lib/demo-mode";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MediaAuth — Trust, verified. AI media authenticity in seconds" },
      {
        name: "description",
        content:
          "Detect deepfakes, manipulated images, cloned voices, and synthetic media with MediaAuth's AI authenticity engine.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="float pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
      <div
        className="float pointer-events-none absolute -right-32 top-40 h-72 w-72 rounded-full bg-accent/30 blur-3xl"
        style={{ animationDelay: "-3s" }}
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <a href="#how" className="hover:text-foreground">
            How it works
          </a>
          <Link to="/login" className="hover:text-foreground">
            Sign in
          </Link>
        </nav>
        <Link
          to="/signup"
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-accent px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition hover:scale-[1.02]"
        >
          Get started <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-16 text-center sm:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs backdrop-blur"
        >
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-muted-foreground">v2 detection engine — now 38% faster</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl"
        >
          Trust, <span className="gradient-text">verified.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12 }}
          className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg"
        >
          MediaAuth scans images, video, audio, and URLs for AI-generated content, face swaps, voice
          clones, and tampering — in seconds.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            to="/signup"
            className="group inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-br from-primary to-accent px-5 text-sm font-semibold text-primary-foreground shadow-[0_0_32px_-8px_var(--primary)] transition hover:scale-[1.02]"
          >
            Start scanning free
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/dashboard"
            onClick={() => enableLiveDemo()}
            className="inline-flex h-11 items-center rounded-lg border border-border bg-card/60 px-5 text-sm font-medium backdrop-blur transition hover:bg-card"
          >
            View live demo
          </Link>
        </motion.div>

        {/* Hero device mock */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="relative mx-auto mt-16 max-w-3xl"
        >
          <div className="gradient-border relative overflow-hidden rounded-2xl bg-card/70 p-1 backdrop-blur-xl elevated">
            <div className="rounded-xl bg-background/80 p-4 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
                <span className="ml-3 font-mono text-xs text-muted-foreground">
                  mediaauth.io/scan
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { label: "Authentic", v: "92%", c: "from-success/30 to-success/0" },
                  { label: "Manipulated", v: "47", c: "from-destructive/30 to-destructive/0" },
                  { label: "Avg. scan", v: "8.4s", c: "from-primary/30 to-primary/0" },
                ].map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-lg bg-gradient-to-br ${m.c} p-4 ring-1 ring-border`}
                  >
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {m.label}
                    </div>
                    <div className="mt-1 font-display text-2xl font-semibold">{m.v}</div>
                  </div>
                ))}
              </div>
              {/* <div className="mt-4 h-32 rounded-lg bg-gradient-to-br from-primary/10 to-accent/10 ring-1 ring-border" /> */}
            </div>
          </div>
        </motion.div>
      </section>

      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: ShieldCheck,
              title: "Deepfake detection",
              desc: "Frame-by-frame face & lip-sync analysis.",
            },
            {
              icon: Activity,
              title: "Voice forensics",
              desc: "Spectral & cadence checks for cloned audio.",
            },
            { icon: Zap, title: "Sub-10s scans", desc: "Average scan completes in 8.4 seconds." },
            {
              icon: Lock,
              title: "Audit-grade reports",
              desc: "Tamper-evident exports for legal use.",
            },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl"
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary ring-1 ring-primary/30">
                <f.icon className="h-4 w-4" />
              </div>
              <h3 className="mt-3 font-display text-base font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
          <Logo compact />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} MediaAuth. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
