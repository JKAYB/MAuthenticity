import { Fragment } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  UploadCloud,
  Layers,
  Gauge,
  FileCheck,
  Shield,
  Zap,
  Lock,
  Eye,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import LiquidEther from "@/components/liquid-ether/LiquidEther";
import { useFluidEtherLandingMode } from "@/hooks/use-fluid-ether-enabled";
import { enableLiveDemo } from "@/lib/demo-mode";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works — MediaAuth" },
      {
        name: "description",
        content:
          "From upload to authenticity report: learn how MediaAuth’s multi-layer detection pipeline analyzes media in seconds.",
      },
    ],
  }),
  component: HowItWorks,
});

const fluidColors = ["#6A7CFF", "#70E0F8", "#B05CFF"] as const;

const steps = [
  {
    n: "01",
    icon: UploadCloud,
    title: "Upload media or paste a URL",
    desc: "Submit an image, video, audio file, or public URL for analysis through a secure scanning flow.",
  },
  {
    n: "02",
    icon: Layers,
    title: "Run forensic and model-based checks",
    desc: "MediaAuth evaluates visual, audio, and structural signals to detect synthetic generation, tampering patterns, and inconsistencies.",
  },
  {
    n: "03",
    icon: Gauge,
    title: "Generate confidence signals",
    desc: "The engine compiles detection signals into a clear confidence-based assessment with indicators for likely authentic or manipulated media.",
  },
  {
    n: "04",
    icon: FileCheck,
    title: "Review the verdict",
    desc: "Get a clean report with findings, confidence output, and traceable scan details for internal review, compliance, or documentation.",
  },
] as const;

const trustPoints = [
  {
    icon: Shield,
    title: "Multi-layer detection",
    desc: "No single-signal shortcut — MediaAuth combines multiple analysis layers before returning a result.",
  },
  {
    icon: Zap,
    title: "Fast processing",
    desc: "Most scans are processed within seconds so teams can review suspicious content quickly.",
  },
  {
    icon: Lock,
    title: "Secure handling",
    desc: "Uploaded media is handled through a controlled processing flow designed for privacy and reliability.",
  },
  {
    icon: Eye,
    title: "Clear outputs",
    desc: "Results are presented in a way that is understandable for both technical and non-technical reviewers.",
  },
] as const;

const processLabels = ["Upload", "Analyze", "Score", "Report"] as const;

const stats = [
  { label: "Avg. scan time", value: "8.4s", grad: "from-primary/30 to-primary/0" },
  { label: "Detection pipeline", value: "Multi-layer", grad: "from-accent/30 to-accent/0" },
  { label: "Output", value: "Audit-ready", grad: "from-success/30 to-success/0" },
] as const;

function HowItWorks() {
  const fluidMode = useFluidEtherLandingMode();

  return (
    <div
      id="how-it-works-page-root"
      className="relative min-h-screen overflow-hidden select-none"
    >
      <style>{`
@media (hover: none) and (pointer: coarse) {
  #how-it-works-page-root .mobile-tap-fix {
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
}
`}</style>
      <div className="grid-bg absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div
        className={
          fluidMode === "lite"
            ? "pointer-events-none absolute inset-0 z-[1] opacity-[0.48] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
            : "pointer-events-none absolute inset-0 z-[1] opacity-[0.55] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
        }
      >
        {fluidMode === "off" ? (
          <div
            className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,color-mix(in_oklab,var(--primary)_35%,transparent),transparent_55%),radial-gradient(90%_60%_at_100%_40%,color-mix(in_oklab,var(--accent)_28%,transparent),transparent_50%),radial-gradient(80%_50%_at_0%_60%,oklch(0.55_0.2_280_/_0.2),transparent_55%)]"
            aria-hidden
          />
        ) : fluidMode === "lite" ? (
          <LiquidEther
            colors={[...fluidColors]}
            mouseForce={8}
            cursorSize={90}
            isViscous={false}
            viscous={24}
            iterationsViscous={12}
            iterationsPoisson={12}
            resolution={0.22}
            BFECC={false}
            isBounce={false}
            autoDemo
            autoSpeed={0.72}
            autoIntensity={2.6}
            takeoverDuration={0.18}
            autoResumeDelay={1200}
            autoRampDuration={0.5}
            className="pointer-events-none !absolute inset-0"
          />
        ) : (
          <LiquidEther
            colors={[...fluidColors]}
            mouseForce={15}
            cursorSize={130}
            isViscous={false}
            viscous={30}
            iterationsViscous={32}
            iterationsPoisson={32}
            resolution={0.5}
            isBounce={false}
            autoDemo
            autoSpeed={0.65}
            autoIntensity={2.2}
            takeoverDuration={0.2}
            autoResumeDelay={3000}
            autoRampDuration={0.6}
            className="pointer-events-none !absolute inset-0"
          />
        )}
      </div>
      <div className="float pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
      <div
        className="float pointer-events-none absolute -right-32 top-40 h-72 w-72 rounded-full bg-accent/30 blur-3xl"
        style={{ animationDelay: "-3s" }}
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link
          to="/"
          aria-label="MediaAuth home"
          className="mobile-tap-fix inline-flex w-fit touch-manipulation rounded-lg outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring [-webkit-tap-highlight-color:transparent]"
        >
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-sm md:flex">
          <a
            href="/#features"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Features
          </a>
          <span className="font-medium text-foreground" aria-current="page">
            How it works
          </span>
          <Link
            to="/login"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        </nav>
        <Link
          to="/signup"
          className="mobile-tap-fix inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-accent px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition hover:scale-[1.02]"
        >
          Get started <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-16 pt-12 text-center sm:pb-20 sm:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs backdrop-blur"
        >
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-muted-foreground">Understand every scan — step by step</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="hero-headline-glow mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl"
        >
          How <span className="gradient-text-animated">MediaAuth</span> works
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.12 }}
          className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg"
        >
          From upload to authenticity report, MediaAuth analyzes media through a fast multi-layer detection
          pipeline designed to flag AI generation, tampering, and manipulation in seconds.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            to="/signup"
            className="mobile-tap-fix group inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-br from-primary to-accent px-5 text-sm font-semibold text-primary-foreground shadow-[0_0_32px_-8px_var(--primary)] transition hover:scale-[1.02]"
          >
            Start scanning free
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/dashboard"
            onClick={() => enableLiveDemo()}
            className="mobile-tap-fix inline-flex h-11 items-center rounded-lg border border-border bg-card/60 px-5 text-sm font-medium backdrop-blur transition hover:bg-card"
          >
            View live demo
          </Link>
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Four steps. One clear verdict.
        </motion.h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
              className="relative overflow-hidden rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl elevated"
            >
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-primary/25 to-accent/20 blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Step {s.n}
                  </span>
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary ring-1 ring-primary/30">
                    <s.icon className="h-4 w-4" />
                  </div>
                </div>
                <h3 className="mt-3 font-display text-base font-semibold leading-snug">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Built for trust, not guesswork
        </motion.h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustPoints.map((t, i) => (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.05 }}
              className="rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl"
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary ring-1 ring-primary/30">
                <t.icon className="h-4 w-4" />
              </div>
              <h3 className="mt-3 font-display text-base font-semibold">{t.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-xl elevated sm:p-8"
        >
          <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pipeline at a glance
          </p>
          <div className="mt-10 flex flex-col items-center md:mt-12 md:flex-row md:flex-wrap md:items-center md:justify-center">
            {processLabels.map((label, i) => (
              <Fragment key={label}>
                {i > 0 ? (
                  <div
                    className="my-2 h-10 w-px shrink-0 bg-gradient-to-b from-primary/45 via-border to-transparent md:my-0 md:mx-1 md:h-px md:w-10 md:bg-gradient-to-r md:from-transparent md:via-border md:to-transparent lg:mx-2 lg:w-14"
                    aria-hidden
                  />
                ) : null}
                <div className="flex min-w-[5.5rem] flex-col items-center px-2 text-center">
                  <div className="grid h-3.5 w-3.5 place-items-center rounded-full bg-primary shadow-[0_0_14px_var(--primary)] ring-2 ring-primary/35" />
                  <span className="mt-3 font-display text-sm font-semibold">{label}</span>
                </div>
              </Fragment>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-20">
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className={`rounded-xl bg-gradient-to-br ${s.grad} p-5 ring-1 ring-border backdrop-blur-sm`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold tabular-nums">{s.value}</div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl border border-border/60 bg-card/60 p-8 backdrop-blur-xl elevated sm:p-10"
        >
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Verify suspicious media with confidence
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground sm:text-base">
            Start scanning images, video, audio, and URLs with a workflow designed for fast, trustworthy
            review.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/signup"
              className="mobile-tap-fix group inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-br from-primary to-accent px-5 text-sm font-semibold text-primary-foreground shadow-[0_0_32px_-8px_var(--primary)] transition hover:scale-[1.02]"
            >
              Start scanning free
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/"
              className="mobile-tap-fix inline-flex h-11 items-center rounded-lg border border-border bg-card/60 px-5 text-sm font-medium backdrop-blur transition hover:bg-card"
            >
              Back to home
            </Link>
          </div>
        </motion.div>
      </section>

      <footer className="relative z-10 border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
          <Link
            to="/"
            aria-label="MediaAuth home"
            className="mobile-tap-fix inline-flex w-fit touch-manipulation rounded-lg outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring [-webkit-tap-highlight-color:transparent]"
          >
            <Logo compact />
          </Link>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} MediaAuth. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
