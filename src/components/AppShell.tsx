import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  Beaker,
  Bot,
  BrainCircuit,
  DatabaseZap,
  ChartCandlestick,
  ClipboardCheck,
  ClipboardList,
  FlaskConical,
  Gauge,
  GitBranch,
  LayoutDashboard,
  MessageSquareText,
  MessagesSquare,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";
import { SafetyBanner } from "@/components/SafetyBanner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navigation = [
  {
    section: "Command Center",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/communications", label: "Communications", icon: MessageSquareText }
    ]
  },
  {
    section: "Research",
    items: [
      { href: "/research", label: "Research", icon: FlaskConical },
      { href: "/ict-lab", label: "ICT Lab", icon: ChartCandlestick },
      { href: "/agent-debate", label: "Agent Debate", icon: MessagesSquare },
      { href: "/agent-audit", label: "Agent Audit", icon: ClipboardCheck },
      { href: "/evidence-quality", label: "Evidence Quality", icon: DatabaseZap },
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/llm-agents", label: "LLM Agents", icon: BrainCircuit },
      { href: "/prompt-lab", label: "Prompt Lab", icon: GitBranch }
    ]
  },
  {
    section: "Data",
    items: [
      { href: "/market-data", label: "Market Data", icon: DatabaseZap },
      { href: "/replay", label: "Replay", icon: RefreshCw },
      { href: "/backtest-lab", label: "Backtest Lab", icon: Beaker },
      { href: "/performance", label: "Performance", icon: Activity }
    ]
  },
  {
    section: "Validation",
    items: [
      { href: "/validation", label: "Validation", icon: ClipboardCheck },
      { href: "/research-quality", label: "Research Quality", icon: ShieldCheck },
      { href: "/readiness-gate", label: "Readiness Gate", icon: ShieldAlert },
      { href: "/self-improvement", label: "Self-Improvement", icon: SlidersHorizontal },
      { href: "/auto-research", label: "Auto Research", icon: Bot }
    ]
  },
  {
    section: "Integrations",
    items: [
      { href: "/advisory-agents", label: "Advisory Agents", icon: Bot },
      { href: "/simulation-runbook", label: "Simulation Runbook", icon: ClipboardList }
    ]
  },
  {
    section: "System",
    items: [{ href: "/settings", label: "Settings", icon: Settings }]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen terminal-grid lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:h-screen lg:flex-row">
        <aside className="border-b border-border bg-background/75 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 items-center justify-between px-5 py-5 lg:block">
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

          <nav className="scrollbar-thin flex gap-3 overflow-x-auto px-3 pb-4 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-4 lg:overflow-x-hidden lg:overflow-y-auto lg:overscroll-contain lg:pb-5 lg:pr-2">
            {navigation.map((group) => (
              <div key={group.section} className="flex min-w-max gap-2 lg:min-w-0 lg:flex-col lg:gap-1">
                <div className="hidden px-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 lg:block">
                  {group.section}
                </div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        "flex min-w-fit items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] lg:min-w-0",
                        isActive && "bg-secondary text-foreground shadow-sm"
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="hidden shrink-0 border-t border-border/70 px-5 pb-5 pt-4 lg:block">
            <div className="rounded-lg border border-border bg-card/70 p-4 text-xs text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                Local-first controls
              </div>
              Mock agents, prompt history, simulated outcomes, and export approvals stay in browser storage.
            </div>
          </div>
        </aside>

        <main className="scrollbar-thin min-w-0 flex-1 px-4 py-5 sm:px-6 lg:h-screen lg:overflow-y-auto lg:px-8">
          <div className="mb-5">
            <SafetyBanner />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
