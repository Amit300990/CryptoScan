import {
  useListPolicies,
  useUpdatePolicy,
  getListPoliciesQueryKey,
} from "@workspace/api-client-react";
import type { PolicyRule } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const RISK_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

const CATEGORY_LABELS: Record<string, string> = {
  algorithm: "Algorithm",
  key_length: "Key Length",
  expiry: "Expiry",
  quantum_readiness: "Quantum Readiness",
  protocol: "Protocol",
};

const CATEGORY_COLORS: Record<string, string> = {
  algorithm: "#6366f1",
  key_length: "#22d3ee",
  expiry: "#f97316",
  quantum_readiness: "#10b981",
  protocol: "#8b5cf6",
};

function PolicyCard({ policy }: { policy: PolicyRule }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const update = useUpdatePolicy();
  const [toggling, setToggling] = useState(false);

  function handleToggle(enabled: boolean) {
    setToggling(true);
    update.mutate(
      { id: policy.id, data: { enabled } },
      {
        onSuccess: () => {
          toast({ title: `Policy ${enabled ? "enabled" : "disabled"}`, description: policy.name });
          void qc.invalidateQueries({ queryKey: getListPoliciesQueryKey() });
          setToggling(false);
        },
        onError: () => {
          toast({ title: "Update failed", variant: "destructive" });
          setToggling(false);
        },
      },
    );
  }

  return (
    <div
      className={`bg-card border rounded-sm p-4 flex flex-col gap-3 transition-all duration-150 ${
        policy.enabled ? "border-card-border" : "border-border/30 opacity-60"
      }`}
      data-testid={`policy-card-${policy.id}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-sm shrink-0 mt-0.5"
          style={{ background: CATEGORY_COLORS[policy.category] + "15" }}
        >
          <Lock className="h-4 w-4" style={{ color: CATEGORY_COLORS[policy.category] }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground leading-tight">{policy.name}</p>
              <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-2">{policy.description}</p>
            </div>
            <Switch
              checked={policy.enabled}
              onCheckedChange={handleToggle}
              disabled={toggling}
              className="shrink-0 mt-0.5"
              data-testid={`policy-toggle-${policy.id}`}
            />
          </div>
        </div>
      </div>

      {/* Footer badges */}
      <div className="flex items-center gap-2 pt-1 border-t border-border/40">
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0"
          style={{
            borderColor: CATEGORY_COLORS[policy.category] + "40",
            color: CATEGORY_COLORS[policy.category],
          }}
        >
          {CATEGORY_LABELS[policy.category] ?? policy.category}
        </Badge>
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 font-semibold uppercase"
          style={{
            borderColor: RISK_COLORS[policy.severity] + "40",
            color: RISK_COLORS[policy.severity],
          }}
        >
          {policy.severity}
        </Badge>
        <span className="ml-auto">
          <span
            className={`text-[10px] font-semibold ${policy.enabled ? "text-green-400" : "text-muted-foreground/40"}`}
          >
            {policy.enabled ? "Active" : "Inactive"}
          </span>
        </span>
      </div>

      {/* Rule expression */}
      <div className="bg-muted/20 rounded-sm px-2.5 py-2 border border-border/30">
        <p className="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-wide mb-1">Rule</p>
        <p className="text-[11px] font-mono text-muted-foreground/70 break-all">{policy.ruleExpression}</p>
      </div>
    </div>
  );
}

export function Policies() {
  const { data: policies, isLoading } = useListPolicies({
    query: { queryKey: getListPoliciesQueryKey() },
  });

  const active = policies?.filter((p) => p.enabled).length ?? 0;
  const total = policies?.length ?? 0;

  return (
    <div className="p-6" data-testid="policies-page">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-foreground">Policy Rules</h1>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            Cryptographic policy enforcement rules
          </p>
        </div>
        {!isLoading && (
          <div className="text-right">
            <p className="text-2xl font-bold text-primary tabular-nums">{active}</p>
            <p className="text-[10px] text-muted-foreground/50">of {total} active</p>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-sm" />
          ))}
        </div>
      ) : policies && policies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {policies.map((p) => (
            <PolicyCard key={p.id} policy={p} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground/40">
          <Shield className="h-8 w-8 mb-3" />
          <p className="text-sm">No policy rules configured</p>
        </div>
      )}
    </div>
  );
}
