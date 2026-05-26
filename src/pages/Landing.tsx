import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  Globe2,
  LineChart,
  Lock,
  PieChart,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Marketing site for FinRoots.
 * Palette: Emerald Prestige  — deep emerald #064e3b, emerald #0d7a5f, gold #c9a84c, cream #f5f0e0
 * Type:    DM Serif Display (headings) + Fira Sans (body)
 * Layout:  Bento grid
 */

const fadeUp: any = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
  }),
};

const NAV = [
  { label: "Product", href: "#product" },
  { label: "Workflow", href: "#workflow" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const STATS = [
  { k: "₹4.2B+", v: "Tracked through FinRoots" },
  { k: "32k", v: "Households onboard" },
  { k: "7", v: "Allocation buckets, one ritual" },
  { k: "4.9★", v: "Across App Store & Play" },
];

const FEATURES = [
  {
    icon: Wallet,
    title: "Every rupee, accounted for",
    body: "Income, expenses, investments — one elegant ledger across 5 currencies. Categorised automatically, owned by you.",
    span: "md:col-span-2",
  },
  {
    icon: PieChart,
    title: "7-bucket budget",
    body: "The proven allocation ritual — Essentials, Wants, Long-term, Insurance, Short-term, Investments, Charity.",
    span: "",
  },
  {
    icon: Target,
    title: "Goals that breathe",
    body: "Set, pause, resume. Watch progress in real time as paychecks land and SIPs auto-allocate.",
    span: "",
  },
  {
    icon: TrendingUp,
    title: "Investment intelligence",
    body: "Portfolio value, dividends, interest — distilled from your transactions, refreshed live.",
    span: "md:col-span-2",
  },
];

const WORKFLOW = [
  {
    n: "01",
    t: "Connect & capture",
    d: "Log income and expenses in seconds, or drop a screenshot — we parse the rest.",
  },
  {
    n: "02",
    t: "Allocate by design",
    d: "Your salary auto-splits into 7 buckets the moment it lands. No spreadsheets. No drift.",
  },
  {
    n: "03",
    t: "Compound calmly",
    d: "Goals advance silently in the background while a weekly digest tells you exactly where you stand.",
  },
];

const TESTIMONIALS = [
  {
    q: "I finally see my money the way I see my calendar — structured, calm, intentional.",
    a: "Ananya R.",
    r: "Product Lead, Bengaluru",
  },
  {
    q: "The 7-bucket model alone changed how my household talks about money.",
    a: "Vikram & Priya",
    r: "Dual-income, Mumbai",
  },
  {
    q: "Replaced four spreadsheets, two apps, and a recurring fight.",
    a: "Dr. Mehta",
    r: "Pune",
  },
];

const PRICING = [
  {
    name: "Roots",
    price: "Free",
    blurb: "For anyone starting the habit.",
    features: ["Unlimited transactions", "1 budget cycle", "3 active goals", "Email digests"],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Canopy",
    price: "₹299",
    blurb: "For households serious about wealth.",
    features: [
      "Everything in Roots",
      "Unlimited budgets & goals",
      "Multi-currency portfolio",
      "Screenshot → transaction AI",
      "Insurance carryover engine",
    ],
    cta: "Start 14-day trial",
    highlight: true,
  },
  {
    name: "Heritage",
    price: "₹899",
    blurb: "For families and advisors.",
    features: [
      "Everything in Canopy",
      "Up to 5 linked profiles",
      "Advisor seat",
      "Priority support",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

const FAQ = [
  {
    q: "Is my financial data safe?",
    a: "Every row is encrypted at rest, scoped to you with row-level security, and never sold. You can export or delete everything at any time.",
  },
  {
    q: "Do you support multiple currencies?",
    a: "Yes — INR, USD, EUR, GBP and AED out of the box, with smart aggregation to your home currency.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Plans are monthly. Cancel in one click — your data stays.",
  },
  {
    q: "Do you replace my bank?",
    a: "No. FinRoots sits on top of your accounts as a calm, opinionated lens — not another transactional ledger.",
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-[#0a1612] text-[#f5f0e0] font-['Fira_Sans'] antialiased selection:bg-[#c9a84c]/40 selection:text-[#f5f0e0]">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[#0d7a5f]/20 blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[520px] h-[520px] rounded-full bg-[#c9a84c]/10 blur-[140px]" />
        <div className="absolute bottom-0 left-1/3 w-[480px] h-[480px] rounded-full bg-[#064e3b]/40 blur-[140px]" />
      </div>

      {/* NAV */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0a1612]/70 border-b border-[#f5f0e0]/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0d7a5f] to-[#064e3b] flex items-center justify-center shadow-[0_0_24px_-4px_rgba(13,122,95,0.6)]">
              <Zap className="w-4.5 h-4.5 text-[#f5f0e0]" />
            </div>
            <span className="font-['DM_Serif_Display'] text-xl tracking-tight">FinRoots</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-[#f5f0e0]/70">
            {NAV.map((n) => (
              <a key={n.label} href={n.href} className="hover:text-[#c9a84c] transition-colors">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-sm text-[#f5f0e0]/70 hover:text-[#f5f0e0] transition-colors px-3 py-2">
              Sign in
            </Link>
            <Link to="/auth?tab=signup">
              <Button className="bg-[#c9a84c] hover:bg-[#d4b65c] text-[#0a1612] font-medium rounded-full px-5 h-9 shadow-[0_8px_30px_-8px_rgba(201,168,76,0.6)]">
                Create account
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO + intro BENTO */}
      <section className="relative max-w-7xl mx-auto px-6 pt-20 pb-12">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/5 text-xs text-[#c9a84c] mb-8"
        >
          <Sparkles className="w-3.5 h-3.5" />
          New — Screenshot to transaction, powered by AI
        </motion.div>

        <div className="grid md:grid-cols-12 gap-6">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={1}
            className="md:col-span-8"
          >
            <h1 className="font-['DM_Serif_Display'] text-5xl md:text-7xl leading-[1.02] tracking-tight text-[#f5f0e0]">
              The wealth OS for households who treat money{" "}
              <span className="italic text-[#c9a84c]">seriously</span>, and themselves{" "}
              <span className="italic text-[#0d7a5f]">kindly</span>.
            </h1>
            <p className="mt-8 text-lg md:text-xl text-[#f5f0e0]/70 max-w-2xl leading-relaxed">
              FinRoots unifies income, expenses, investments, budgets and goals into one
              quiet ritual. Built around the 7-bucket allocation model, designed for people
              who want clarity — not another dashboard to manage.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Link to="/auth">
                <Button className="bg-[#c9a84c] hover:bg-[#d4b65c] text-[#0a1612] font-medium rounded-full px-6 h-12 text-base group shadow-[0_12px_40px_-10px_rgba(201,168,76,0.6)]">
                  Start free — no card
                  <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <a
                href="#product"
                className="px-6 h-12 inline-flex items-center gap-2 rounded-full border border-[#f5f0e0]/15 text-sm hover:bg-[#f5f0e0]/5 transition-colors"
              >
                See the product
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
            <div className="mt-10 flex items-center gap-6 text-xs text-[#f5f0e0]/50">
              <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Bank-grade encryption</span>
              <span className="flex items-center gap-1.5"><Globe2 className="w-3.5 h-3.5" /> 5 currencies</span>
              <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> No ads, ever</span>
            </div>
          </motion.div>

          {/* Hero bento card */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="show"
            custom={2}
            className="md:col-span-4 relative rounded-3xl bg-gradient-to-br from-[#0d7a5f]/30 to-[#064e3b]/10 border border-[#f5f0e0]/10 p-6 overflow-hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,168,76,0.15),transparent_60%)]" />
            <div className="relative">
              <div className="text-xs uppercase tracking-[0.2em] text-[#c9a84c]/80 mb-3">Net Worth</div>
              <div className="font-['DM_Serif_Display'] text-4xl text-[#f5f0e0]">₹ 42,18,640</div>
              <div className="mt-2 text-sm text-[#0d7a5f] flex items-center gap-1"><ArrowUpRight className="w-4 h-4" /> +12.4% this quarter</div>

              <div className="mt-8 space-y-3">
                {[
                  { label: "Essentials", v: 35 },
                  { label: "Investments", v: 28 },
                  { label: "Goals", v: 18 },
                  { label: "Wants", v: 12 },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs text-[#f5f0e0]/70 mb-1.5">
                      <span>{row.label}</span>
                      <span>{row.v}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#f5f0e0]/10 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${row.v}%` }}
                        transition={{ duration: 1.2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full bg-gradient-to-r from-[#0d7a5f] to-[#c9a84c]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Stats strip */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden bg-[#f5f0e0]/10 border border-[#f5f0e0]/10"
        >
          {STATS.map((s) => (
            <div key={s.v} className="bg-[#0a1612] p-6">
              <div className="font-['DM_Serif_Display'] text-3xl text-[#c9a84c]">{s.k}</div>
              <div className="text-xs text-[#f5f0e0]/60 mt-1">{s.v}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* PRODUCT — BENTO GRID */}
      <section id="product" className="max-w-7xl mx-auto px-6 py-24">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[#c9a84c] mb-3">The Product</div>
            <h2 className="font-['DM_Serif_Display'] text-4xl md:text-5xl tracking-tight max-w-2xl">
              One canvas. Every dimension of your money.
            </h2>
          </div>
          <p className="text-[#f5f0e0]/60 max-w-md">
            A bento of focused tools — each one quiet on its own, transformative together.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
              custom={i}
              className={`group relative rounded-3xl border border-[#f5f0e0]/10 bg-gradient-to-br from-[#0f1f1a] to-[#0a1612] p-7 hover:border-[#c9a84c]/40 transition-all ${f.span}`}
            >
              <div className="w-11 h-11 rounded-xl bg-[#0d7a5f]/15 border border-[#0d7a5f]/30 flex items-center justify-center mb-5">
                <f.icon className="w-5 h-5 text-[#c9a84c]" />
              </div>
              <h3 className="font-['DM_Serif_Display'] text-2xl mb-2 text-[#f5f0e0]">{f.title}</h3>
              <p className="text-sm text-[#f5f0e0]/65 leading-relaxed">{f.body}</p>
              <ArrowUpRight className="absolute top-7 right-7 w-4 h-4 text-[#f5f0e0]/30 group-hover:text-[#c9a84c] group-hover:rotate-12 transition-all" />
            </motion.div>
          ))}

          {/* Wide visual bento — buckets ring */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="md:col-span-3 rounded-3xl border border-[#f5f0e0]/10 bg-gradient-to-br from-[#064e3b]/40 via-[#0a1612] to-[#c9a84c]/10 p-10 overflow-hidden"
          >
            <div className="grid md:grid-cols-2 gap-10 items-center">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[#c9a84c] mb-3">The 7-Bucket Ritual</div>
                <h3 className="font-['DM_Serif_Display'] text-3xl md:text-4xl leading-tight mb-4">
                  An ancient idea, engineered for modern paychecks.
                </h3>
                <p className="text-[#f5f0e0]/65 leading-relaxed mb-6">
                  Every salary auto-distributes into seven intentional buckets. Spend without
                  guilt. Invest without thought. Give without hesitation.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "Essentials",
                    "Wants",
                    "Long-term",
                    "Insurance",
                    "Short-term",
                    "Investments",
                    "Charity",
                  ].map((b) => (
                    <div key={b} className="flex items-center gap-2 text-sm text-[#f5f0e0]/80">
                      <Check className="w-3.5 h-3.5 text-[#0d7a5f]" />
                      {b}
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative aspect-square max-w-md mx-auto">
                <div className="absolute inset-0 rounded-full border border-[#c9a84c]/20" />
                <div className="absolute inset-8 rounded-full border border-[#0d7a5f]/30" />
                <div className="absolute inset-16 rounded-full border border-[#f5f0e0]/10" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-xs uppercase tracking-[0.2em] text-[#c9a84c]/70 mb-2">Allocated</div>
                    <div className="font-['DM_Serif_Display'] text-5xl text-[#f5f0e0]">100%</div>
                    <div className="text-sm text-[#f5f0e0]/60 mt-1">across 7 buckets</div>
                  </div>
                </div>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                  const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
                  const x = 50 + 50 * Math.cos(angle);
                  const y = 50 + 50 * Math.sin(angle);
                  return (
                    <div
                      key={i}
                      className="absolute w-2.5 h-2.5 rounded-full bg-[#c9a84c] shadow-[0_0_12px_rgba(201,168,76,0.8)]"
                      style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section id="workflow" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <div className="text-xs uppercase tracking-[0.2em] text-[#c9a84c] mb-3">The Workflow</div>
          <h2 className="font-['DM_Serif_Display'] text-4xl md:text-5xl tracking-tight">
            Three movements. One quiet system.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {WORKFLOW.map((s, i) => (
            <motion.div
              key={s.n}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              custom={i}
              className="rounded-3xl border border-[#f5f0e0]/10 bg-[#0f1f1a]/50 p-8"
            >
              <div className="font-['DM_Serif_Display'] text-5xl text-[#c9a84c]/40 mb-6">{s.n}</div>
              <h3 className="font-['DM_Serif_Display'] text-2xl mb-3">{s.t}</h3>
              <p className="text-sm text-[#f5f0e0]/65 leading-relaxed">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* TESTIMONIALS — bento mosaic */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-3 gap-4">
          {TESTIMONIALS.map((t, i) => (
            <motion.figure
              key={t.a}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              custom={i}
              className={`rounded-3xl border border-[#f5f0e0]/10 p-8 ${
                i === 1 ? "bg-gradient-to-br from-[#c9a84c]/15 to-[#064e3b]/30 md:scale-[1.02]" : "bg-[#0f1f1a]/50"
              }`}
            >
              <div className="text-[#c9a84c] mb-4 font-['DM_Serif_Display'] text-4xl leading-none">“</div>
              <blockquote className="font-['DM_Serif_Display'] text-xl leading-snug mb-6">
                {t.q}
              </blockquote>
              <figcaption>
                <div className="text-sm text-[#f5f0e0]">{t.a}</div>
                <div className="text-xs text-[#f5f0e0]/55">{t.r}</div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <div className="text-xs uppercase tracking-[0.2em] text-[#c9a84c] mb-3">Pricing</div>
          <h2 className="font-['DM_Serif_Display'] text-4xl md:text-5xl tracking-tight">
            Quietly priced. Loudly worth it.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {PRICING.map((p, i) => (
            <motion.div
              key={p.name}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              custom={i}
              className={`relative rounded-3xl p-8 border ${
                p.highlight
                  ? "bg-gradient-to-br from-[#c9a84c]/20 to-[#0d7a5f]/15 border-[#c9a84c]/40 shadow-[0_20px_80px_-30px_rgba(201,168,76,0.4)]"
                  : "border-[#f5f0e0]/10 bg-[#0f1f1a]/40"
              }`}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-8 px-3 py-1 rounded-full bg-[#c9a84c] text-[#0a1612] text-[10px] uppercase tracking-[0.15em] font-semibold">
                  Most chosen
                </div>
              )}
              <div className="text-sm text-[#f5f0e0]/70 mb-2">{p.name}</div>
              <div className="flex items-baseline gap-1">
                <span className="font-['DM_Serif_Display'] text-5xl">{p.price}</span>
                {p.price !== "Free" && <span className="text-sm text-[#f5f0e0]/50">/mo</span>}
              </div>
              <p className="text-sm text-[#f5f0e0]/60 mt-3 mb-7">{p.blurb}</p>
              <ul className="space-y-2.5 mb-8">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[#f5f0e0]/80">
                    <Check className="w-4 h-4 text-[#0d7a5f] mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link to="/auth" className="block">
                <Button
                  className={`w-full rounded-full h-11 font-medium ${
                    p.highlight
                      ? "bg-[#c9a84c] hover:bg-[#d4b65c] text-[#0a1612]"
                      : "bg-[#f5f0e0]/5 hover:bg-[#f5f0e0]/10 text-[#f5f0e0] border border-[#f5f0e0]/15"
                  }`}
                >
                  {p.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-4xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <div className="text-xs uppercase tracking-[0.2em] text-[#c9a84c] mb-3">FAQ</div>
          <h2 className="font-['DM_Serif_Display'] text-4xl md:text-5xl tracking-tight">
            Answers, before you ask.
          </h2>
        </div>
        <div className="divide-y divide-[#f5f0e0]/10 border-y border-[#f5f0e0]/10">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-6">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <span className="font-['DM_Serif_Display'] text-lg pr-6">{f.q}</span>
                <ChevronRight className="w-4 h-4 text-[#c9a84c] transition-transform group-open:rotate-90 flex-shrink-0" />
              </summary>
              <p className="mt-4 text-sm text-[#f5f0e0]/65 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="relative rounded-[2rem] overflow-hidden border border-[#c9a84c]/30 bg-gradient-to-br from-[#064e3b] via-[#0a1612] to-[#0a1612] p-12 md:p-20 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(201,168,76,0.18),transparent_70%)]" />
          <div className="relative">
            <h2 className="font-['DM_Serif_Display'] text-4xl md:text-6xl tracking-tight max-w-3xl mx-auto leading-[1.05]">
              Begin the ritual your future self will thank you for.
            </h2>
            <p className="mt-6 text-[#f5f0e0]/70 max-w-xl mx-auto">
              Two minutes to set up. A lifetime of clarity.
            </p>
            <Link to="/auth" className="inline-block mt-10">
              <Button className="bg-[#c9a84c] hover:bg-[#d4b65c] text-[#0a1612] rounded-full h-12 px-8 text-base font-medium shadow-[0_20px_60px_-15px_rgba(201,168,76,0.7)]">
                Get started — it's free
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#f5f0e0]/10 mt-12">
        <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[#0d7a5f] flex items-center justify-center">
                <Zap className="w-4 h-4 text-[#f5f0e0]" />
              </div>
              <span className="font-['DM_Serif_Display'] text-lg">FinRoots</span>
            </div>
            <p className="text-xs text-[#f5f0e0]/50 leading-relaxed">
              The calm, intelligent wealth OS for modern households.
            </p>
          </div>
          {[
            { t: "Product", l: ["Features", "Pricing", "Security", "Changelog"] },
            { t: "Company", l: ["About", "Careers", "Press", "Contact"] },
            { t: "Legal", l: ["Privacy", "Terms", "Cookies", "GDPR"] },
          ].map((col) => (
            <div key={col.t}>
              <div className="text-xs uppercase tracking-[0.15em] text-[#c9a84c]/80 mb-3">{col.t}</div>
              <ul className="space-y-2 text-sm text-[#f5f0e0]/60">
                {col.l.map((i) => (
                  <li key={i}><a href="#" className="hover:text-[#f5f0e0] transition-colors">{i}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-[#f5f0e0]/10">
          <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-[#f5f0e0]/40">
            <span>© 2026 FinRoots. All rights reserved.</span>
            <span>Made with intention in Bengaluru.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;