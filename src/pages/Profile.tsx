import { useState } from "react";
import { User, Mail, Globe } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState("Arun K");
  const [phone, setPhone] = useState("+91 98XXXXXX21");
  const [base, setBase] = useState<"INR" | "USD" | "AED">("INR");

  return (
    <div className="px-6 sm:px-8 py-8 space-y-6 max-w-[900px] mx-auto">
      <header>
        <span className="text-xs font-semibold uppercase tracking-widest text-primary font-display">Account</span>
        <h1 className="font-display text-3xl font-bold text-foreground mt-1 flex items-center gap-2">
          <User className="w-7 h-7" /> Profile
        </h1>
      </header>

      <div className="glass-card p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/60 to-chart-2/60 flex items-center justify-center text-xl font-bold">
          {name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg font-bold text-foreground">{name}</div>
          <div className="text-sm text-muted-foreground flex items-center gap-1 truncate">
            <Mail className="w-3.5 h-3.5" /> {user?.email ?? "—"}
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        <h2 className="font-display font-semibold text-foreground">Personal details</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-3">
        <h2 className="font-display font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-4 h-4" /> Base currency
        </h2>
        <p className="text-sm text-muted-foreground">Used as the default for new transactions and dashboard totals.</p>
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {(["INR", "USD", "AED"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setBase(c)}
              className={cn(
                "h-12 rounded-md border text-sm font-medium transition-all",
                base === c ? "border-primary bg-primary/10 text-primary" : "border-border/40 hover:bg-accent/30"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => toast.success("Profile saved")}>Save changes</Button>
      </div>
    </div>
  );
}