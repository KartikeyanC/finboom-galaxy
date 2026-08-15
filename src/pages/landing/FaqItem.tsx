import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

/** One FAQ row with an animated height — split out of Landing.tsx in Stage 4.13. */

/* ── FAQ item with animated height ──────────────────────────────── */
export default function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-1">
      <button onClick={() => setOpen((o) => !o)} data-cursor className="w-full flex items-center justify-between gap-6 py-5 text-left">
        <span className="text-lg font-medium text-white">{q}</span>
        <ChevronDown className={`w-4 h-4 text-[#19B886] shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <p className="pb-5 text-sm text-[#9aa3a0] leading-relaxed max-w-2xl">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
