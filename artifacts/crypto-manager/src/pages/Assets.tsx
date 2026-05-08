import { useState } from "react";
import { Link } from "wouter";
import {
  useListAssets,
  useListEnvironments,
  getListAssetsQueryKey,
  getListEnvironmentsQueryKey,
} from "@workspace/api-client-react";
import type { CryptoAsset } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Search, ChevronRight, ShieldCheck, ShieldOff, ChevronLeft } from "lucide-react";
import { SiGooglecloud, SiVmware } from "react-icons/si";
import { FaAws, FaMicrosoft } from "react-icons/fa";
import { Server } from "lucide-react";
import { format } from "date-fns";

const RISK_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  certificate: "Certificate",
  symmetric_key: "Symmetric Key",
  asymmetric_key: "Asymmetric Key",
  tls_config: "TLS Config",
  ssh_key: "SSH Key",
  code_signing_key: "Code Signing",
  kms_key: "KMS Key",
  secret: "Secret",
};

function EnvIcon({ type }: { type: string }) {
  const cls = "h-3.5 w-3.5";
  switch (type) {
    case "aws": return <FaAws className={cls} style={{ color: "#FF9900" }} />;
    case "azure": return <FaMicrosoft className={cls} style={{ color: "#0078D4" }} />;
    case "gcp": return <SiGooglecloud className={cls} style={{ color: "#4285F4" }} />;
    case "vmware": return <SiVmware className={cls} style={{ color: "#607078" }} />;
    default: return <Server className={`${cls} text-cyan-400`} />;
  }
}

function RiskBadge({ level }: { level: string }) {
  return (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 font-semibold uppercase tracking-wide"
      style={{ borderColor: RISK_COLORS[level] + "40", color: RISK_COLORS[level], background: RISK_COLORS[level] + "10" }}
    >
      {level}
    </Badge>
  );
}

function AssetRow({ asset }: { asset: CryptoAsset }) {
  return (
    <Link href={`/assets/${asset.id}`}>
      <div
        className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer group border-b border-border/40 last:border-0"
        data-testid={`asset-row-${asset.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground truncate">{asset.name}</p>
            {asset.isQuantumSafe ? (
              <ShieldCheck className="h-3 w-3 text-green-500 shrink-0" aria-label="Quantum-safe" />
            ) : (
              <ShieldOff className="h-3 w-3 text-red-500/60 shrink-0" aria-label="Quantum-vulnerable" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">
            {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
            {asset.algorithm ? ` · ${asset.algorithm}` : ""}
            {asset.keyLength ? ` ${asset.keyLength}-bit` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <EnvIcon type={asset.environmentType} />
          <span className="text-[11px] text-muted-foreground/60 max-w-[100px] truncate">
            {asset.environmentName}
          </span>
        </div>
        <div className="w-20 text-right shrink-0">
          {asset.expiresAt ? (
            <span className="text-[11px] text-muted-foreground/60">
              {format(new Date(asset.expiresAt), "MMM d, yy")}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/30">—</span>
          )}
        </div>
        <div className="w-20 flex justify-end shrink-0">
          <RiskBadge level={asset.riskLevel} />
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary/60 shrink-0 transition-colors" />
      </div>
    </Link>
  );
}

const PAGE_SIZE = 15;

export function Assets() {
  const [search, setSearch] = useState("");
  const [riskLevel, setRiskLevel] = useState<string>("");
  const [assetType, setAssetType] = useState<string>("");
  const [envId, setEnvId] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data: environments } = useListEnvironments({
    query: { queryKey: getListEnvironmentsQueryKey() },
  });

  const params = {
    search: search || undefined,
    riskLevel: riskLevel || undefined,
    assetType: assetType || undefined,
    environmentId: envId ? Number(envId) : undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading } = useListAssets(params, {
    query: { queryKey: getListAssetsQueryKey(params) },
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="p-6" data-testid="assets-page">
      <div className="mb-5">
        <h1 className="text-lg font-bold text-foreground">Asset Inventory</h1>
        <p className="text-xs text-muted-foreground/60 mt-0.5">
          All discovered cryptographic assets across environments
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Search assets…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            className="pl-8 h-8 text-sm"
            data-testid="assets-search"
          />
        </div>
        <Select value={riskLevel} onValueChange={(v) => { setRiskLevel(v === "all" ? "" : v); resetPage(); }}>
          <SelectTrigger className="h-8 w-36 text-xs" data-testid="risk-filter">
            <SelectValue placeholder="Risk level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risk levels</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assetType} onValueChange={(v) => { setAssetType(v === "all" ? "" : v); resetPage(); }}>
          <SelectTrigger className="h-8 w-40 text-xs" data-testid="type-filter">
            <SelectValue placeholder="Asset type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="certificate">Certificate</SelectItem>
            <SelectItem value="symmetric_key">Symmetric Key</SelectItem>
            <SelectItem value="asymmetric_key">Asymmetric Key</SelectItem>
            <SelectItem value="tls_config">TLS Config</SelectItem>
            <SelectItem value="ssh_key">SSH Key</SelectItem>
            <SelectItem value="code_signing_key">Code Signing</SelectItem>
            <SelectItem value="kms_key">KMS Key</SelectItem>
            <SelectItem value="secret">Secret</SelectItem>
          </SelectContent>
        </Select>
        <Select value={envId} onValueChange={(v) => { setEnvId(v === "all" ? "" : v); resetPage(); }}>
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
        {data && (
          <span className="text-xs text-muted-foreground/50 ml-1">
            {data.total} asset{data.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-sm overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-4 px-4 py-2 bg-muted/20 border-b border-border/60">
          <p className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Asset</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 w-32">Environment</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 w-20 text-right">Expires</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 w-20 text-right">Risk</p>
          <div className="w-3.5" />
        </div>

        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-none border-b border-border/40" />
            ))}
          </div>
        ) : data && data.assets.length > 0 ? (
          data.assets.map((asset) => <AssetRow key={asset.id} asset={asset} />)
        ) : (
          <div className="flex items-center justify-center h-40 text-muted-foreground/40 text-sm">
            No assets match your filters
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            data-testid="prev-page"
          >
            <ChevronLeft className="h-3 w-3" /> Prev
          </Button>
          <span className="text-xs text-muted-foreground/50">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            data-testid="next-page"
          >
            Next <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
