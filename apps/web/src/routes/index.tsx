import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles, Activity, Lock, Zap } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import LiquidEther from "@/components/liquid-ether/LiquidEther";
import { useFluidEtherLandingMode } from "@/hooks/use-fluid-ether-enabled";
import {
  LANDING_FLUID_FULL_BASE,
  LANDING_FLUID_LITE_BASE,
  LANDING_SCROLL_IDLE_MS,
  LANDING_STATIC_FLUID_FALLBACK_CLASS,
  landingFluidScrollTuning,
} from "@/lib/landing-fluid-ether-props";
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

const fluidColors = ["#6A7CFF", "#70E0F8", "#B05CFF"] as const;

function Landing() {
  const fluidMode = useFluidEtherLandingMode();
  const [showFluid, setShowFluid] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Defer WebGL until after first paint so LCP and scroll stay responsive.
  useEffect(() => {
    if (fluidMode === "off") {
      setShowFluid(false);
      return;
    }
    let raf = 0;
    raf = requestAnimationFrame(() => {
      setShowFluid(true);
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [fluidMode]);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolling(true);
      if (scrollIdleRef.current) clearTimeout(scrollIdleRef.current);
      scrollIdleRef.current = setTimeout(() => {
        scrollIdleRef.current = null;
        setIsScrolling(false);
      }, LANDING_SCROLL_IDLE_MS);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollIdleRef.current) clearTimeout(scrollIdleRef.current);
    };
  }, []);

  const liquidEtherProps = useMemo(() => {
    if (fluidMode === "off") return null;
    const base = fluidMode === "lite" ? LANDING_FLUID_LITE_BASE : LANDING_FLUID_FULL_BASE;
    const scrollPatch = isScrolling ? landingFluidScrollTuning(fluidMode) : {};
    return { ...base, ...scrollPatch, colors: [...fluidColors] };
  }, [fluidMode, isScrolling]);

  return (
    <div
      id="landing-page-root"
      className="relative min-h-screen overflow-hidden select-none"
    >
      <style>{`
@media (hover: none) and (pointer: coarse) {
  #landing-page-root .mobile-tap-fix {
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
        {fluidMode === "off" || !showFluid || !liquidEtherProps ? (
          <div className={LANDING_STATIC_FLUID_FALLBACK_CLASS} aria-hidden />
        ) : (
          <LiquidEther
            {...liquidEtherProps}
            className="pointer-events-none !absolute inset-0"
          />
        )}
      </div>
      <div className="float pointer-events-none absolute -left-32 top-20 h-72 w-72 rounded-full bg-primary/30 blur-2xl" />
      <div
        className="float pointer-events-none absolute -right-32 top-40 h-72 w-72 rounded-full bg-accent/30 blur-2xl"
        style={{ animationDelay: "-3s" }}
      />

      <MarketingHeader currentPage="home" />

      <section
        id="how"
        className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-16 text-center sm:pt-24"
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs backdrop-blur"
        >
          <Sparkles className="h-3 w-3 text-primary" />
          <span className="text-muted-foreground">v2 detection engine — now 38% faster</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, delay: 0.04 }}
          className="hero-headline-glow mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl"
        >
          Trust,{" "}
          <span className="gradient-text-animated inline-block whitespace-nowrap">
            verified.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.48, delay: 0.1 }}
          className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg"
        >
          MediaAuth scans images, video, audio, and URLs for AI-generated content, face swaps, voice
          clones, and tampering — in seconds.
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
              to="/how-it-works"
              className="mobile-tap-fix inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-border bg-card/60 px-3 text-sm font-medium backdrop-blur transition hover:bg-card md:hidden"
            >
              How it works
            </Link>
            <Link
              to="/dashboard"
              onClick={() => enableLiveDemo()}
              className="mobile-tap-fix inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-border bg-card/60 px-5 text-sm font-medium backdrop-blur transition hover:bg-card sm:min-w-[10.5rem] md:flex-none"
            >
              View live demo
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
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
              transition={{ duration: 0.36, delay: i * 0.05 }}
              className="rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur-lg"
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
