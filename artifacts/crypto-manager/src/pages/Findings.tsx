import { useState } from "react";
import {
  useListFindings,
  useUpdateFinding,
  useListEnvironments,
  useGetQuantumReadiness,
  getListFindingsQueryKey,
  getListEnvironmentsQueryKey,
  getGetQuantumReadinessQueryKey,
} from "@workspace/api-client-react";
import type { Finding } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, RotateCcw, ShieldCheck, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const SEV_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

const STATUS_CONFIG = {
  open: { label: "Open", color: "#ef4444" },
  acknowledged: { label: "Acknowledged", color: "#f97316" },
  resolved: { label: "Resolved", color: "#10b981" },
  suppressed: { label: "Suppressed", color: "#6b7280" },
};

const NEXT_STATUS: Record<string, string> = {
  open: "acknowledged",
  acknowledged: "resolved",
  resolved: "open",
  suppressed: "open",
};

const STATUS_ACTION_LABELS: Record<string, string> = {
  open: "Acknowledge",
  acknowledged: "Resolve",
  resolved: "Reopen",
  suppressed: "Reopen",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  open: Eye,
  acknowledged: CheckCircle2,
  resolved: RotateCcw,
  suppressed: RotateCcw,
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 font-bold uppercase tracking-wide shrink-0"
      style={{
        borderColor: SEV_COLORS[severity] + "40",
        color: SEV_COLORS[severity],
        background: SEV_COLORS[severity] + "10",
      }}
    >
      {severity}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const conf = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? { label: status, color: "#6b7280" };
  return (
    <span className="text-[10px] font-medium" style={{ color: conf.color }}>
      {conf.label}
    </span>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const update = useUpdateFinding();
  const [loading, setLoading] = useState(false);
  const ActionIcon = STATUS_ICONS[finding.status] ?? Eye;

  function handleStatusChange() {
    const nextStatus = NEXT_STATUS[finding.status];
    if (!nextStatus) return;
    setLoading(true);
    update.mutate(
      { id: finding.id, data: { status: nextStatus as Finding["status"] } },
      {
        onSuccess: () => {
          toast({ title: "Finding updated", description: `Status changed to ${nextStatus}.` });
          void qc.invalidateQueries({ queryKey: getListFindingsQueryKey() });
          setLoading(false);
        },
        onError: () => {
          toast({ title: "Update failed", variant: "destructive" });
          setLoading(false);
        },
      },
    );
  }

  return (
    <div
      className="flex items-start gap-4 px-4 py-3 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
      data-testid={`finding-row-${finding.id}`}
    >
      <div className="flex items-center pt-0.5 shrink-0">
        <SeverityBadge severity={finding.severity} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{finding.title}</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-2">{finding.description}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-muted-foreground/50">{finding.assetName}</span>
          <span className="text-[10px] text-muted-foreground/30">·</span>
          <span className="text-[10px] text-muted-foreground/50">{finding.environmentName}</span>
          <span className="text-[10px] text-muted-foreground/30">·</span>
          <span className="text-[10px] text-muted-foreground/40">
            {format(new Date(finding.detectedAt), "MMM d, yyyy")}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <StatusBadge status={finding.status} />
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] px-2 gap-1"
          onClick={handleStatusChange}
          disabled={loading}
          data-testid={`finding-action-${finding.id}`}
        >
          <ActionIcon className="h-3 w-3" />
          {STATUS_ACTION_LABELS[finding.status] ?? "Update"}
        </Button>
      </div>
    </div>
  );
}

function QuantumReadinessPanel() {
  const { data: pq, isLoading } = useGetQuantumReadiness({
    query: { queryKey: getGetQuantumReadinessQueryKey() },
  });

  const scoreColor =
    !pq ? "#6b7280"
    : pq.readinessScore >= 70 ? "#10b981"
    : pq.readinessScore >= 40 ? "#eab308"
    : "#ef4444";

  return (
    <div className="bg-card border border-card-border rounded-sm p-4 mb-5" data-testid="pq-readiness-panel">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-4 w-4 text-muted-foreground/60" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
          Post-Quantum Readiness
        </h2>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-sm" />
          ))}
        </div>
      ) : pq ? (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-muted/20 rounded-sm p-3">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide mb-1">Readiness Score</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>
                {pq.readinessScore}<span className="text-sm font-normal text-muted-foreground/40">/100</span>
              </p>
            </div>
            <div className="bg-muted/20 rounded-sm p-3">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide mb-1">Quantum-Safe</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-bold tabular-nums text-emerald-500">{pq.quantumSafeCount}</p>
                <p className="text-[10px] text-muted-foreground/40">assets</p>
              </div>
            </div>
            <div className="bg-muted/20 rounded-sm p-3">
              <div className="flex items-center gap-1 mb-1">
                <ShieldAlert className="h-3 w-3 text-rose-500" />
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Vulnerable</p>
              </div>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-bold tabular-nums text-rose-500">{pq.vulnerableCount}</p>
                <p className="text-[10px] text-muted-foreground/40">assets</p>
              </div>
            </div>
          </div>

          {pq.vulnerableAlgorithms.length > 0 && (
            <div className="mb-2">
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide mb-1.5">Vulnerable Algorithms</p>
              <div className="flex flex-wrap gap-1">
                {pq.vulnerableAlgorithms.map((alg) => (
                  <span
                    key={alg}
                    className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono"
                  >
                    {alg}
                  </span>
                ))}
              </div>
            </div>
          )}

          {pq.recommendations.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide mb-1.5">Top Recommendation</p>
              <p className="text-xs text-muted-foreground/70 leading-relaxed">{pq.recommendations[0]}</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

export function Findings() {
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("open");
  const [envId, setEnvId] = useState("");

  const { data: environments } = useListEnvironments({
    query: { queryKey: getListEnvironmentsQueryKey() },
  });

  const params = {
    severity: severity || undefined,
    status: status || undefined,
    environmentId: envId ? Number(envId) : undefined,
  };

  const { data: findings, isLoading } = useListFindings(params, {
    query: { queryKey: getListFindingsQueryKey(params) },
  });

  const counts = findings
    ? {
        critical: findings.filter((f) => f.severity === "critical").length,
        high: findings.filter((f) => f.severity === "high").length,
        medium: findings.filter((f) => f.severity === "medium").length,
        low: findings.filter((f) => f.severity === "low").length,
      }
    : null;

  return (
    <div className="p-6" data-testid="findings-page">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-foreground">Risk & Compliance</h1>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          Policy violations, cryptographic risk findings, and post-quantum readiness
        </p>
      </div>

      <QuantumReadinessPanel />

      {/* Severity counters */}
      {counts && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {(["critical", "high", "medium", "low"] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverity(severity === sev ? "" : sev)}
              className="bg-card border border-card-border rounded-sm p-3 text-left hover:border-primary/20 transition-colors"
              style={{ borderColor: severity === sev ? SEV_COLORS[sev] + "60" : undefined }}
              data-testid={`severity-filter-${sev}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: SEV_COLORS[sev] }}>
                {sev}
              </p>
              <p className="text-2xl font-bold tabular-nums text-foreground mt-0.5">{counts[sev]}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={status} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-40 text-xs" data-testid="status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="suppressed">Suppressed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={(v) => setSeverity(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-36 text-xs" data-testid="severity-filter">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={envId} onValueChange={(v) => setEnvId(v === "all" ? "" : v)}>
          <SelectTrigger className="h-8 w-44 text-xs" data-testid="env-filter">
            <SelectValue placeholder="Environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All environments</SelectItem>
            {environments?.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {findings && (
          <span className="text-xs text-muted-foreground/50 ml-1">
            {findings.length} finding{findings.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Findings list */}
      <div className="bg-card border border-card-border rounded-sm overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/20 border-b border-border/60">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 w-20 shrink-0">Severity</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 flex-1">Finding</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 shrink-0">Actions</p>
        </div>

        {isLoading ? (
          <div>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-none border-b border-border/40" />
            ))}
          </div>
        ) : findings && findings.length > 0 ? (
          findings.map((f) => <FindingRow key={f.id} finding={f} />)
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/40">
            <AlertTriangle className="h-7 w-7 mb-2" />
            <p className="text-sm">No findings match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
