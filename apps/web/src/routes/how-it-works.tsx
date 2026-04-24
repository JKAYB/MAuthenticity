import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import LiquidEther from "../components/LiquidEtherWithRef";
import { useFluidEtherLandingMode } from "@/hooks/use-fluid-ether-enabled";
import {
  LANDING_FLUID_FULL_BASE,
  LANDING_FLUID_LITE_BASE,
  LANDING_STATIC_FLUID_FALLBACK_CLASS,
} from "@/lib/landing-fluid-ether-props";
import { enableLiveDemo } from "@/lib/demo-mode";

const HERO_FLUID_HEIGHT_CLASS = "h-[min(100dvh,56rem)]";
const HERO_FLUID_TOP_END_CLASS = "top-[min(100dvh,56rem)]";

function StaticFluidBackdrop() {
  return <div className={LANDING_STATIC_FLUID_FALLBACK_CLASS} aria-hidden />;
}

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works — MAuthenticity" },
      {
        name: "description",
        content:
          "From upload to authenticity report: learn how MAuthenticity's multi-layer detection pipeline analyzes media in seconds.",
      },
    ],
  }),
  component: HowItWorks,
});

const fluidColors = ["#7FD4F5", "#70E0F8", "#B05CFF"] as const;

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
    desc: "MAuthenticity evaluates visual, audio, and structural signals to detect synthetic generation, tampering patterns, and inconsistencies.",
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
    desc: "No single-signal shortcut — MAuthenticity combines multiple analysis layers before returning a result.",
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

const belowFoldCv: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "900px",
};

function HowItWorks() {
  const fluidMode = useFluidEtherLandingMode();
  const [showFluid, setShowFluid] = useState(false);

  // Computed once on mount (or fluidMode change). Never recomputed on scroll.
  const liquidEtherProps = useMemo(() => {
    if (fluidMode === "off") return null;
    return {
      ...(fluidMode === "lite" ? LANDING_FLUID_LITE_BASE : LANDING_FLUID_FULL_BASE),
      colors: [...fluidColors],
    };
  }, [fluidMode]);

  // Defer WebGL past first paint so LCP is unblocked.
  useEffect(() => {
    if (fluidMode === "off") {
      setShowFluid(false);
      return;
    }
    const raf = requestAnimationFrame(() => setShowFluid(true));
    return () => cancelAnimationFrame(raf);
  }, [fluidMode]);

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

      {/* Fluid layer — hero only. LiquidEther is mounted once and frozen. */}
      <div
        className={
          fluidMode === "lite"
            ? "pointer-events-none absolute inset-0 z-[1] opacity-[0.48] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
            : "pointer-events-none absolute inset-0 z-[1] opacity-[0.55] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
        }
      >
        {/* Hero region — WebGL */}
        <div
          className={`pointer-events-none absolute left-0 right-0 top-0 ${HERO_FLUID_HEIGHT_CLASS} overflow-hidden`}
        >
          {fluidMode === "off" || !showFluid || !liquidEtherProps ? (
            <StaticFluidBackdrop />
          ) : (
            <LiquidEther
              {...liquidEtherProps}
              className={`pointer-events-none !absolute inset-0 ${HERO_FLUID_HEIGHT_CLASS}`}
            />
          )}
        </div>
        {/* Below-hero — static fallback only, no WebGL */}
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 ${HERO_FLUID_TOP_END_CLASS}`}>
          <StaticFluidBackdrop />
        </div>
      </div>

      <div className="float pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-primary/30 blur-2xl" />
      <div
        className="float pointer-events-none absolute -right-32 top-40 h-72 w-72 rounded-full bg-accent/30 blur-2xl"
        style={{ animationDelay: "-3s" }}
      />

      <MarketingHeader currentPage="how-it-works" />

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-16 pt-12 text-center sm:pb-20 sm:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs backdrop-blur-sm"
        >
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-muted-foreground">Understand every scan — step by step</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, delay: 0.04 }}
          className="hero-headline-glow mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl"
        >
          How <span className="gradient-text-animated">MAuthenticity</span> works
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, delay: 0.1 }}
          className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg"
        >
          From upload to authenticity report, MAuthenticity analyzes media through a fast multi-layer detection
          pipeline designed to flag AI generation, tampering, and manipulation in seconds.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, delay: 0.16 }}
          className="mt-8 flex w-full max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center"
        >
          <Link
            to="/signup"
            className="mobile-tap-fix group inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-primary to-accent px-5 text-sm font-semibold text-primary-foreground shadow-[0_0_32px_-8px_var(--primary)] transition hover:scale-[1.02] sm:w-auto"
          >
            Start scanning free
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <div className="flex w-full flex-row gap-3 sm:w-auto">
            <Link
              to="/"
              className="mobile-tap-fix inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-border bg-card/60 px-3 text-sm font-medium backdrop-blur-sm transition hover:bg-card md:hidden"
            >
              Home
            </Link>
            <Link
              to="/dashboard"
              onClick={() => enableLiveDemo()}
              className="mobile-tap-fix inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-border bg-card/60 px-5 text-sm font-medium backdrop-blur-sm transition hover:bg-card sm:min-w-[10.5rem] md:flex-none"
            >
              View demo
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20" style={belowFoldCv}>
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "0px 0px -8% 0px" }}
          transition={{ duration: 0.28 }}
          className="text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Four steps. One clear verdict.
        </motion.h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "0px 0px -12% 0px" }}
              transition={{ duration: 0.26, delay: Math.min(i, 2) * 0.04 }}
              className="relative overflow-hidden rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm elevated"
            >
              <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-primary/25 to-accent/20 blur-xl" />
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

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20" style={belowFoldCv}>
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "0px 0px -8% 0px" }}
          transition={{ duration: 0.28 }}
          className="text-center font-display text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          Built for trust, not guesswork
        </motion.h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustPoints.map((t, i) => (
            <motion.div
              key={t.title}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, margin: "0px 0px -12% 0px" }}
              transition={{ duration: 0.26, delay: Math.min(i, 2) * 0.04 }}
              className="rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm"
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

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-20" style={belowFoldCv}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "0px 0px -10% 0px" }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-border/60 bg-card/50 p-6 backdrop-blur-sm elevated sm:p-8"
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

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-20" style={belowFoldCv}>
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.label}
              className={`rounded-xl bg-gradient-to-br ${s.grad} p-5 ring-1 ring-border backdrop-blur-sm`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-2 font-display text-2xl font-semibold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24 text-center" style={belowFoldCv}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "0px 0px -10% 0px" }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border border-border/60 bg-card/60 p-8 backdrop-blur-sm elevated sm:p-10"
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
              className="mobile-tap-fix inline-flex h-11 items-center rounded-lg border border-border bg-card/60 px-5 text-sm font-medium backdrop-blur-sm transition hover:bg-card"
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
            aria-label="MAuthenticity home"
            className="mobile-tap-fix inline-flex w-fit touch-manipulation rounded-lg outline-none ring-offset-background transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring [-webkit-tap-highlight-color:transparent]"
          >
            <Logo compact />
          </Link>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} MAuthenticity. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}