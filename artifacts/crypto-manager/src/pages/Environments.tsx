import {
  useListEnvironments,
  useTriggerScan,
  useListConnections,
  useCreateConnection,
  useUpdateConnection,
  useDeleteConnection,
  useTestConnection,
  getListEnvironmentsQueryKey,
  getListConnectionsQueryKey,
} from "@workspace/api-client-react";
import type {
  Environment,
  EnvironmentConnection,
  CredentialPayload,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SiGooglecloud, SiVmware } from "react-icons/si";
import { FaAws, FaMicrosoft } from "react-icons/fa";
import {
  Server,
  RefreshCw,
  WifiOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Trash2,
  FlaskConical,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

type ScanProgressEvent = {
  type: "asset_discovered" | "finding_generated" | "scan_completed" | "scan_failed";
  jobId: number;
  environmentId: number;
  assetsDiscovered: number;
  totalAssets: number;
  findingsGenerated: number;
  assetName?: string;
  errorMessage?: string;
};

function useScanStream(
  environmentId: number,
  active: boolean,
  onEvent: (event: ScanProgressEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!active) return;

    const es = new EventSource(`/api/environments/${environmentId}/scan-stream`);

    es.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as ScanProgressEvent;
        onEventRef.current(data);
      } catch {
        // ignore malformed events
      }
    };

    // Don't close on transient errors — EventSource retries automatically.
    // Only close on terminal events (scan_completed / scan_failed) via onEvent.
    es.onerror = () => {
      // intentionally empty: let the browser handle reconnect
    };

    return () => {
      es.close();
    };
  }, [environmentId, active]);
}

function EnvTypeIcon({ type }: { type: string }) {
  const cls = "h-5 w-5";
  switch (type) {
    case "aws": return <FaAws className={cls} style={{ color: "#FF9900" }} />;
    case "azure": return <FaMicrosoft className={cls} style={{ color: "#0078D4" }} />;
    case "gcp": return <SiGooglecloud className={cls} style={{ color: "#4285F4" }} />;
    case "vmware": return <SiVmware className={cls} style={{ color: "#607078" }} />;
    default: return <Server className={`${cls} text-cyan-400`} />;
  }
}

const ENV_TYPE_LABELS: Record<string, string> = {
  on_premises: "On-Premises",
  aws: "Amazon Web Services",
  azure: "Microsoft Azure",
  gcp: "Google Cloud Platform",
  vmware: "VMware vSphere",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; spin?: boolean }> = {
  connected: { label: "Connected", color: "#10b981", icon: CheckCircle2 },
  disconnected: { label: "Disconnected", color: "#6b7280", icon: WifiOff },
  scanning: { label: "Scanning…", color: "#22d3ee", icon: Loader2, spin: true },
  error: { label: "Error", color: "#ef4444", icon: AlertCircle },
};

function RiskBar({ score }: { score: number }) {
  const color = score > 70 ? "#ef4444" : score > 40 ? "#f97316" : "#10b981";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-8 text-right" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function AwsForm({
  value,
  onChange,
}: {
  value: Partial<{ accessKeyId: string; secretAccessKey: string; region: string; roleArn: string }>;
  onChange: (v: typeof value) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">Access Key ID *</Label>
        <Input className="h-8 text-xs" placeholder="AKIAIOSFODNN7EXAMPLE" value={value.accessKeyId ?? ""} onChange={(e) => onChange({ ...value, accessKeyId: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Secret Access Key *</Label>
        <Input className="h-8 text-xs" type="password" placeholder="••••••••" value={value.secretAccessKey ?? ""} onChange={(e) => onChange({ ...value, secretAccessKey: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Region *</Label>
        <Input className="h-8 text-xs" placeholder="us-east-1" value={value.region ?? ""} onChange={(e) => onChange({ ...value, region: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">IAM Role ARN (optional)</Label>
        <Input className="h-8 text-xs" placeholder="arn:aws:iam::123456789:role/CryptoGuardRole" value={value.roleArn ?? ""} onChange={(e) => onChange({ ...value, roleArn: e.target.value })} />
      </div>
    </div>
  );
}

function AzureForm({
  value,
  onChange,
}: {
  value: Partial<{ tenantId: string; clientId: string; clientSecret: string; subscriptionId: string }>;
  onChange: (v: typeof value) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">Tenant ID *</Label>
        <Input className="h-8 text-xs" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={value.tenantId ?? ""} onChange={(e) => onChange({ ...value, tenantId: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Client ID *</Label>
        <Input className="h-8 text-xs" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={value.clientId ?? ""} onChange={(e) => onChange({ ...value, clientId: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Client Secret *</Label>
        <Input className="h-8 text-xs" type="password" placeholder="••••••••" value={value.clientSecret ?? ""} onChange={(e) => onChange({ ...value, clientSecret: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Subscription ID *</Label>
        <Input className="h-8 text-xs" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={value.subscriptionId ?? ""} onChange={(e) => onChange({ ...value, subscriptionId: e.target.value })} />
      </div>
    </div>
  );
}

function GcpForm({
  value,
  onChange,
}: {
  value: Partial<{ projectId: string; serviceAccountJson: string }>;
  onChange: (v: typeof value) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">Project ID *</Label>
        <Input className="h-8 text-xs" placeholder="my-project-123" value={value.projectId ?? ""} onChange={(e) => onChange({ ...value, projectId: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Service Account JSON *</Label>
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          placeholder='{"type": "service_account", ...}'
          value={value.serviceAccountJson ?? ""}
          onChange={(e) => onChange({ ...value, serviceAccountJson: e.target.value })}
        />
      </div>
    </div>
  );
}

function VmwareForm({
  value,
  onChange,
}: {
  value: Partial<{ vcenterUrl: string; username: string; password: string; verifyTls: boolean }>;
  onChange: (v: typeof value) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">vCenter URL *</Label>
        <Input className="h-8 text-xs" placeholder="https://vcenter.example.com" value={value.vcenterUrl ?? ""} onChange={(e) => onChange({ ...value, vcenterUrl: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Username *</Label>
        <Input className="h-8 text-xs" placeholder="administrator@vsphere.local" value={value.username ?? ""} onChange={(e) => onChange({ ...value, username: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Password *</Label>
        <Input className="h-8 text-xs" type="password" placeholder="••••••••" value={value.password ?? ""} onChange={(e) => onChange({ ...value, password: e.target.value })} />
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Switch id="verify-tls" checked={value.verifyTls ?? true} onCheckedChange={(v) => onChange({ ...value, verifyTls: v })} />
        <Label htmlFor="verify-tls" className="text-xs cursor-pointer">Verify TLS Certificate</Label>
      </div>
    </div>
  );
}

function OnPremForm({
  value,
  onChange,
}: {
  value: Partial<{ host: string; port: number; username: string; password: string; useTls: boolean }>;
  onChange: (v: typeof value) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2 grid gap-1.5">
          <Label className="text-xs">Host *</Label>
          <Input className="h-8 text-xs" placeholder="192.168.1.100" value={value.host ?? ""} onChange={(e) => onChange({ ...value, host: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Port *</Label>
          <Input className="h-8 text-xs" type="number" placeholder="22" value={value.port ?? ""} onChange={(e) => onChange({ ...value, port: parseInt(e.target.value) || undefined })} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Username *</Label>
        <Input className="h-8 text-xs" placeholder="admin" value={value.username ?? ""} onChange={(e) => onChange({ ...value, username: e.target.value })} />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Password</Label>
        <Input className="h-8 text-xs" type="password" placeholder="••••••••" value={value.password ?? ""} onChange={(e) => onChange({ ...value, password: e.target.value })} />
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Switch id="use-tls" checked={value.useTls ?? false} onCheckedChange={(v) => onChange({ ...value, useTls: v })} />
        <Label htmlFor="use-tls" className="text-xs cursor-pointer">Use TLS</Label>
      </div>
    </div>
  );
}

type CredentialFormState = Record<string, unknown>;

function buildCredentialPayload(providerType: string, state: CredentialFormState): CredentialPayload | null {
  switch (providerType) {
    case "aws": {
      const { accessKeyId, secretAccessKey, region } = state as { accessKeyId?: string; secretAccessKey?: string; region?: string; roleArn?: string };
      if (!accessKeyId || !secretAccessKey || !region) return null;
      return {
        providerType: "aws",
        accessKeyId,
        secretAccessKey,
        region,
        roleArn: (state.roleArn as string) || null,
      };
    }
    case "azure": {
      const { tenantId, clientId, clientSecret, subscriptionId } = state as { tenantId?: string; clientId?: string; clientSecret?: string; subscriptionId?: string };
      if (!tenantId || !clientId || !clientSecret || !subscriptionId) return null;
      return { providerType: "azure", tenantId, clientId, clientSecret, subscriptionId };
    }
    case "gcp": {
      const { projectId, serviceAccountJson } = state as { projectId?: string; serviceAccountJson?: string };
      if (!projectId || !serviceAccountJson) return null;
      return { providerType: "gcp", projectId, serviceAccountJson };
    }
    case "vmware": {
      const { vcenterUrl, username, password } = state as { vcenterUrl?: string; username?: string; password?: string; verifyTls?: boolean };
      if (!vcenterUrl || !username || !password) return null;
      return { providerType: "vmware", vcenterUrl, username, password, verifyTls: (state.verifyTls as boolean) ?? true };
    }
    case "on_premises": {
      const { host, port, username } = state as { host?: string; port?: number; username?: string };
      if (!host || !port || !username) return null;
      return { providerType: "on_premises", host, port, username, password: (state.password as string) || undefined, useTls: (state.useTls as boolean) ?? false };
    }
    default:
      return null;
  }
}

function ConnectionBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500/10 text-green-400 border-green-500/20",
    inactive: "bg-muted/60 text-muted-foreground border-border",
    error: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors[status] ?? colors.inactive}`}>
      {status}
    </span>
  );
}

function CredentialDialog({
  env,
  open,
  onClose,
}: {
  env: Environment;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [formState, setFormState] = useState<CredentialFormState>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const { data: connections, isLoading } = useListConnections(env.id, {
    query: { queryKey: getListConnectionsQueryKey(env.id), enabled: open },
  });

  const createConn = useCreateConnection();
  const updateConn = useUpdateConnection();
  const deleteConn = useDeleteConnection();
  const testConn = useTestConnection();

  const existingConn = connections?.[0] as EnvironmentConnection | undefined;

  function invalidate() {
    void qc.invalidateQueries({ queryKey: getListConnectionsQueryKey(env.id) });
  }

  function handleSave() {
    const payload = buildCredentialPayload(env.type, formState);
    if (!payload) {
      toast({ title: "Missing required fields", variant: "destructive" });
      return;
    }
    setSaving(true);

    if (existingConn) {
      updateConn.mutate(
        { id: env.id, connectionId: existingConn.id, data: { credentials: payload } },
        {
          onSuccess: () => { toast({ title: "Credentials updated" }); invalidate(); setSaving(false); },
          onError: () => { toast({ title: "Failed to update", variant: "destructive" }); setSaving(false); },
        },
      );
    } else {
      createConn.mutate(
        { id: env.id, data: { providerType: env.type, credentials: payload } },
        {
          onSuccess: () => { toast({ title: "Credentials saved" }); invalidate(); setSaving(false); },
          onError: () => { toast({ title: "Failed to save", variant: "destructive" }); setSaving(false); },
        },
      );
    }
  }

  function handleTest() {
    if (!existingConn) return;
    setTesting(true);
    testConn.mutate(
      { id: env.id, connectionId: existingConn.id },
      {
        onSuccess: (result) => {
          toast({ title: result.success ? "Connection verified" : "Connection failed", description: `${result.message}${result.latencyMs != null ? ` (${result.latencyMs}ms)` : ""}` });
          invalidate();
          setTesting(false);
        },
        onError: () => { toast({ title: "Test failed", variant: "destructive" }); setTesting(false); },
      },
    );
  }

  function handleDelete() {
    if (!existingConn) return;
    deleteConn.mutate(
      { id: env.id, connectionId: existingConn.id },
      {
        onSuccess: () => { toast({ title: "Connection removed" }); invalidate(); },
        onError: () => { toast({ title: "Delete failed", variant: "destructive" }); },
      },
    );
  }

  const credState = formState as Record<string, unknown>;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md bg-card border-card-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-cyan-400" />
            {ENV_TYPE_LABELS[env.type] ?? env.type} — Credentials
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground/60">
            Configure {env.name} connection credentials
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="grid gap-4">
            {existingConn && (
              <div className="flex items-center justify-between text-xs text-muted-foreground/60 bg-muted/20 rounded px-3 py-2">
                <span>Connection status: <ConnectionBadge status={existingConn.status} /></span>
                {existingConn.lastTestedAt && (
                  <span>Tested {formatDistanceToNow(new Date(existingConn.lastTestedAt), { addSuffix: true })}</span>
                )}
              </div>
            )}

            {env.type === "aws" && (
              <AwsForm value={credState as Parameters<typeof AwsForm>[0]["value"]} onChange={setFormState} />
            )}
            {env.type === "azure" && (
              <AzureForm value={credState as Parameters<typeof AzureForm>[0]["value"]} onChange={setFormState} />
            )}
            {env.type === "gcp" && (
              <GcpForm value={credState as Parameters<typeof GcpForm>[0]["value"]} onChange={setFormState} />
            )}
            {env.type === "vmware" && (
              <VmwareForm value={credState as Parameters<typeof VmwareForm>[0]["value"]} onChange={setFormState} />
            )}
            {env.type === "on_premises" && (
              <OnPremForm value={credState as Parameters<typeof OnPremForm>[0]["value"]} onChange={setFormState} />
            )}

            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
              <div className="flex gap-2">
                {existingConn && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2.5 gap-1"
                      onClick={handleTest}
                      disabled={testing}
                    >
                      <FlaskConical className={`h-3 w-3 ${testing ? "animate-pulse" : ""}`} />
                      Test
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                      onClick={handleDelete}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>Cancel</Button>
                <Button size="sm" className="h-7 text-xs px-3" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {existingConn ? "Update" : "Save"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EnvironmentCard({ env }: { env: Environment }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [credOpen, setCredOpen] = useState(false);
  const [progress, setProgress] = useState<{ discovered: number; total: number; lastAsset: string | null } | null>(null);
  const trigger = useTriggerScan();
  const isScanning = scanning || env.status === "scanning";
  const statusConf = STATUS_CONFIG[env.status] ?? STATUS_CONFIG.disconnected;
  const StatusIcon = statusConf.icon;

  // Fallback: if the environment status transitions out of "scanning" (caught by the
  // polling refetch on the parent query), clear local scanning state even if the SSE
  // terminal event was missed (e.g. on reconnect or tab sleep).
  useEffect(() => {
    if (scanning && env.status !== "scanning") {
      setScanning(false);
      setProgress(null);
    }
  }, [scanning, env.status]);

  useScanStream(env.id, isScanning, (event) => {
    if (event.type === "asset_discovered" || event.type === "finding_generated") {
      setProgress({
        discovered: event.assetsDiscovered,
        total: event.totalAssets,
        lastAsset: event.assetName ?? null,
      });
    } else if (event.type === "scan_completed" || event.type === "scan_failed") {
      setProgress(null);
      setScanning(false);
      void qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
      if (event.type === "scan_completed") {
        toast({
          title: "Scan complete",
          description: `Found ${event.assetsDiscovered} assets and ${event.findingsGenerated} findings.`,
        });
      } else {
        toast({
          title: "Scan failed",
          description: event.errorMessage ?? "Scan encountered an error.",
          variant: "destructive",
        });
      }
    }
  });

  function handleScan() {
    setScanning(true);
    setProgress({ discovered: 0, total: 0, lastAsset: null });
    trigger.mutate(
      { id: env.id },
      {
        onSuccess: () => {
          toast({ title: "Scan started", description: `Scanning ${env.name}…` });
          void qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
        },
        onError: () => {
          toast({ title: "Scan failed", description: "Could not trigger scan.", variant: "destructive" });
          setScanning(false);
          setProgress(null);
        },
      },
    );
  }

  const progressPct = progress && progress.total > 0
    ? Math.round((progress.discovered / progress.total) * 100)
    : 0;

  return (
    <>
      <div
        className="bg-card border border-card-border rounded-sm p-5 flex flex-col gap-4 hover:border-primary/20 transition-colors"
        data-testid={`env-card-${env.id}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-sm bg-muted/60 shrink-0">
            <EnvTypeIcon type={env.type} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground truncate">{env.name}</h3>
              <div className="flex items-center gap-1 shrink-0">
                <StatusIcon
                  className="h-3 w-3"
                  style={{
                    color: statusConf.color,
                    ...(statusConf.spin ? { animation: "spin 1.5s linear infinite" } : {}),
                  }}
                />
                <span className="text-[10px] font-medium" style={{ color: statusConf.color }}>
                  {statusConf.label}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              {ENV_TYPE_LABELS[env.type] ?? env.type}
              {env.region ? ` · ${env.region}` : ""}
            </p>
          </div>
        </div>

        {/* Live scan progress bar */}
        {isScanning && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-cyan-400 font-medium animate-pulse">Scanning…</span>
              {progress && progress.total > 0 && (
                <span className="text-muted-foreground/60 tabular-nums">
                  {progress.discovered} / {progress.total} assets
                </span>
              )}
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: progress && progress.total > 0 ? `${progressPct}%` : "15%",
                  background: "linear-gradient(90deg, #22d3ee, #6366f1)",
                  animation: (!progress || progress.total === 0) ? "pulse 1.5s ease-in-out infinite" : undefined,
                }}
              />
            </div>
            {progress?.lastAsset && (
              <p className="text-[10px] text-muted-foreground/50 truncate">
                Discovered: {progress.lastAsset}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/30 rounded-sm p-2.5">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Assets</p>
            <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">
              {isScanning && progress ? progress.discovered : env.assetCount}
            </p>
          </div>
          <div className="bg-muted/30 rounded-sm p-2.5">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wide mb-1.5">Risk Score</p>
            <RiskBar score={env.riskScore} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground/40">
            {env.lastScannedAt
              ? `Scanned ${formatDistanceToNow(new Date(env.lastScannedAt), { addSuffix: true })}`
              : "Never scanned"}
          </p>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 gap-1"
              onClick={() => setCredOpen(true)}
              data-testid={`cred-btn-${env.id}`}
            >
              <KeyRound className="h-3 w-3" />
              Credentials
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 gap-1"
              onClick={handleScan}
              disabled={isScanning}
              data-testid={`scan-btn-${env.id}`}
            >
              <RefreshCw className={`h-3 w-3 ${isScanning ? "animate-spin" : ""}`} />
              {isScanning ? "Scanning…" : "Scan"}
            </Button>
          </div>
        </div>
      </div>

      <CredentialDialog env={env} open={credOpen} onClose={() => setCredOpen(false)} />
    </>
  );
}

export function Environments() {
  const { data: environments, isLoading } = useListEnvironments({
    query: {
      queryKey: getListEnvironmentsQueryKey(),
      refetchInterval: (query) => {
        const data = query.state.data;
        if (!data) return false;
        const hasScanning = data.some((e: { status: string }) => e.status === "scanning");
        return hasScanning ? 2000 : false;
      },
    },
  });

  return (
    <div className="p-6" data-testid="environments-page">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-foreground">Environments</h1>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          Manage cloud and on-premises environments and their credential connections
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-sm" />
          ))}
        </div>
      ) : environments && environments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {environments.map((env) => (
            <EnvironmentCard key={env.id} env={env} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground/40">
          <WifiOff className="h-8 w-8 mb-3" />
          <p className="text-sm">No environments configured</p>
        </div>
      )}
    </div>
  );
}
