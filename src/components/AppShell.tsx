import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  Bot,
  ChartCandlestick,
  FlaskConical,
  Gauge,
  GitBranch,
  LayoutDashboard,
  RefreshCw,
  Settings,
  ShieldCheck
} from "lucide-react";
import { SafetyBanner } from "@/components/SafetyBanner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/research", label: "Research", icon: FlaskConical },
  { href: "/ict-lab", label: "ICT Lab", icon: ChartCandlestick },
  { href: "/replay", label: "Replay", icon: RefreshCw },
  { href: "/performance", label: "Performance", icon: Activity },
  { href: "/prompt-lab", label: "Prompt Lab", icon: GitBranch },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen terminal-grid">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-border bg-background/75 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-5 py-5 lg:block">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                  <Gauge className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold tracking-normal">GoTrader AI Lab</h1>
                  <p className="text-xs text-muted-foreground">Simulation research layer</p>
                </div>
              </div>
            </div>
            <Badge variant="warning" className="lg:mt-5">
              No live trading
            </Badge>
          </div>

          <nav className="flex gap-2 overflow-x-auto px-3 pb-4 lg:flex-col lg:overflow-visible">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    "flex min-w-fit items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground",
                    isActive && "bg-secondary text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden px-5 pb-5 lg:block">
            <div className="rounded-lg border border-border bg-card/70 p-4 text-xs text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                Local-first controls
              </div>
              Mock agents, prompt history, simulated outcomes, and export approvals stay in browser storage.
            </div>
          </div>
        </aside>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-5">
            <SafetyBanner />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
