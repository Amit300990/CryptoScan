import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings2, Radio, Shield, ChevronRight, Save, Wifi, Key, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { customFetch } from "@workspace/api-client-react";

async function fetchSetting(key: string): Promise<Record<string, unknown>> {
  return customFetch<Record<string, unknown>>(`/api/settings/${key}`);
}

async function saveSetting(key: string, value: Record<string, unknown>): Promise<Record<string, unknown>> {
  return customFetch<Record<string, unknown>>(`/api/settings/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

type Tab = "policy" | "syslog" | "sso";

const TABS: { id: Tab; label: string; icon: React.ElementType; description: string }[] = [
  { id: "policy", label: "Policy Defaults", icon: Shield, description: "Global policy thresholds and enforcement behaviour" },
  { id: "syslog", label: "Log Forwarding", icon: Radio, description: "Forward audit events to a remote Syslog server" },
  { id: "sso", label: "Single Sign-On", icon: Key, description: "Configure OIDC or SAML identity provider" },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-md bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition"
    />
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-md bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-sm text-foreground group"
    >
      <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors ${checked ? "bg-primary border-primary" : "bg-muted border-border"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </span>
      {label}
    </button>
  );
}

function SaveButton({ saving }: { saving: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
    >
      <Save className="h-4 w-4" />
      {saving ? "Saving…" : "Save Changes"}
    </button>
  );
}

function PolicyTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["settings", "policy_defaults"], queryFn: () => fetchSetting("policy_defaults") });
  const [form, setForm] = useState<Record<string, unknown>>({});
  const merged = { criticalRiskThreshold: 80, highRiskThreshold: 60, autoRemediationEnabled: false, requireApprovalForChanges: true, minimumKeySize: 2048, prohibitedAlgorithms: "MD5,SHA1,DES,3DES,RC4", policyMode: "enforce", ...data, ...form };

  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => saveSetting("policy_defaults", v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", "policy_defaults"] }); setForm({}); toast({ title: "Policy defaults saved" }); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  function set(k: string, v: unknown) { setForm((f) => ({ ...f, [k]: v })); }

  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(merged as Record<string, unknown>); }} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Field label="Critical Risk Threshold (%)" hint="Findings above this score are flagged Critical">
          <Input value={String(merged.criticalRiskThreshold)} onChange={(v) => set("criticalRiskThreshold", Number(v))} type="number" placeholder="80" />
        </Field>
        <Field label="High Risk Threshold (%)" hint="Findings above this score are flagged High">
          <Input value={String(merged.highRiskThreshold)} onChange={(v) => set("highRiskThreshold", Number(v))} type="number" placeholder="60" />
        </Field>
        <Field label="Minimum Key Size (bits)" hint="Keys smaller than this are flagged as weak">
          <Select value={String(merged.minimumKeySize)} onChange={(v) => set("minimumKeySize", Number(v))} options={[
            { value: "1024", label: "1024 bits" },
            { value: "2048", label: "2048 bits" },
            { value: "3072", label: "3072 bits" },
            { value: "4096", label: "4096 bits" },
          ]} />
        </Field>
        <Field label="Policy Mode" hint="Enforce blocks violations; Audit only logs them">
          <Select value={String(merged.policyMode)} onChange={(v) => set("policyMode", v)} options={[
            { value: "enforce", label: "Enforce (block violations)" },
            { value: "audit", label: "Audit only (log violations)" },
          ]} />
        </Field>
        <Field label="Prohibited Algorithms" hint="Comma-separated list of banned cipher/hash algorithms">
          <Input value={String(merged.prohibitedAlgorithms)} onChange={(v) => set("prohibitedAlgorithms", v)} placeholder="MD5,SHA1,DES,3DES,RC4" />
        </Field>
      </div>
      <div className="space-y-4 pt-2">
        <Toggle checked={Boolean(merged.autoRemediationEnabled)} onChange={(v) => set("autoRemediationEnabled", v)} label="Enable auto-remediation (rotate keys automatically on violation)" />
        <Toggle checked={Boolean(merged.requireApprovalForChanges)} onChange={(v) => set("requireApprovalForChanges", v)} label="Require approval before applying policy changes" />
      </div>
      <div className="flex justify-end pt-2 border-t border-border">
        <SaveButton saving={mut.isPending} />
      </div>
    </form>
  );
}

function SyslogTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["settings", "log_forwarding"], queryFn: () => fetchSetting("log_forwarding") });
  const [form, setForm] = useState<Record<string, unknown>>({});
  const merged = { enabled: false, host: "", port: 514, protocol: "udp", facility: "local0", format: "rfc5424", tlsEnabled: false, tlsCertPath: "", ...data, ...form };

  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => saveSetting("log_forwarding", v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", "log_forwarding"] }); setForm({}); toast({ title: "Log forwarding settings saved" }); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  function set(k: string, v: unknown) { setForm((f) => ({ ...f, [k]: v })); }

  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(merged as Record<string, unknown>); }} className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-md bg-muted/50 border border-border">
        <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          When enabled, CryptoGuard will forward all system log events (scans, policy changes, findings) to the configured Syslog endpoint. Ensure your receiver is running and accessible from the server.
        </p>
      </div>
      <Toggle checked={Boolean(merged.enabled)} onChange={(v) => set("enabled", v)} label="Enable Syslog forwarding" />
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity ${merged.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
        <Field label="Syslog Host" hint="Hostname or IP of your Syslog receiver">
          <Input value={String(merged.host)} onChange={(v) => set("host", v)} placeholder="syslog.corp.example.com" />
        </Field>
        <Field label="Port" hint="Default UDP 514, TLS 6514">
          <Input value={String(merged.port)} onChange={(v) => set("port", Number(v))} type="number" placeholder="514" />
        </Field>
        <Field label="Transport Protocol">
          <Select value={String(merged.protocol)} onChange={(v) => set("protocol", v)} options={[
            { value: "udp", label: "UDP" },
            { value: "tcp", label: "TCP" },
            { value: "tcp+tls", label: "TCP+TLS" },
          ]} />
        </Field>
        <Field label="Facility">
          <Select value={String(merged.facility)} onChange={(v) => set("facility", v)} options={[
            { value: "kern", label: "kern (0)" },
            { value: "user", label: "user (1)" },
            { value: "mail", label: "mail (2)" },
            { value: "daemon", label: "daemon (3)" },
            { value: "auth", label: "auth (4)" },
            { value: "syslog", label: "syslog (5)" },
            { value: "local0", label: "local0 (16)" },
            { value: "local1", label: "local1 (17)" },
            { value: "local2", label: "local2 (18)" },
            { value: "local3", label: "local3 (19)" },
            { value: "local4", label: "local4 (20)" },
            { value: "local5", label: "local5 (21)" },
            { value: "local6", label: "local6 (22)" },
            { value: "local7", label: "local7 (23)" },
          ]} />
        </Field>
        <Field label="Message Format">
          <Select value={String(merged.format)} onChange={(v) => set("format", v)} options={[
            { value: "rfc5424", label: "RFC 5424 (modern)" },
            { value: "rfc3164", label: "RFC 3164 (BSD)" },
            { value: "json", label: "JSON over syslog" },
          ]} />
        </Field>
        {String(merged.protocol) === "tcp+tls" && (
          <Field label="TLS Certificate Path" hint="Path to PEM certificate on the server">
            <Input value={String(merged.tlsCertPath)} onChange={(v) => set("tlsCertPath", v)} placeholder="/etc/ssl/certs/syslog.pem" />
          </Field>
        )}
      </div>
      <div className="flex justify-end pt-2 border-t border-border">
        <SaveButton saving={mut.isPending} />
      </div>
    </form>
  );
}

function SSOTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({ queryKey: ["settings", "sso"], queryFn: () => fetchSetting("sso") });
  const [form, setForm] = useState<Record<string, unknown>>({});
  const merged = { enabled: false, provider: "oidc", oidcDiscoveryUrl: "", clientId: "", clientSecret: "", redirectUri: "", scopes: "openid email profile", samlMetadataUrl: "", samlEntityId: "", samlAcsUrl: "", allowedDomains: "", groupAttribute: "", adminGroup: "", ...data, ...form };

  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => saveSetting("sso", v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", "sso"] }); setForm({}); toast({ title: "SSO settings saved" }); },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  function set(k: string, v: unknown) { setForm((f) => ({ ...f, [k]: v })); }

  const isOIDC = merged.provider === "oidc";

  return (
    <form onSubmit={(e) => { e.preventDefault(); mut.mutate(merged as Record<string, unknown>); }} className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-md bg-muted/50 border border-border">
        <Wifi className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Configure your corporate identity provider to enable Single Sign-On. Supports OpenID Connect (OIDC) compatible with Okta, Azure AD, Google Workspace, Auth0, and Keycloak; or SAML 2.0 for legacy providers.
        </p>
      </div>

      <Toggle checked={Boolean(merged.enabled)} onChange={(v) => set("enabled", v)} label="Enable Single Sign-On" />

      <div className={`space-y-6 transition-opacity ${merged.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
        <Field label="SSO Protocol">
          <div className="flex gap-3">
            {[{ id: "oidc", label: "OIDC / OAuth 2.0" }, { id: "saml", label: "SAML 2.0" }].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set("provider", p.id)}
                className={`flex-1 px-4 py-2.5 rounded-md border text-sm font-medium transition ${merged.provider === p.id ? "bg-primary/10 border-primary text-primary" : "bg-muted border-border text-muted-foreground hover:text-foreground"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        {isOIDC ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Discovery URL" hint="e.g. https://accounts.google.com/.well-known/openid-configuration">
              <Input value={String(merged.oidcDiscoveryUrl)} onChange={(v) => set("oidcDiscoveryUrl", v)} placeholder="https://your-idp.com/.well-known/openid-configuration" />
            </Field>
            <Field label="Client ID">
              <Input value={String(merged.clientId)} onChange={(v) => set("clientId", v)} placeholder="your-client-id" />
            </Field>
            <Field label="Client Secret">
              <Input value={String(merged.clientSecret)} onChange={(v) => set("clientSecret", v)} type="password" placeholder="••••••••••••••••" />
            </Field>
            <Field label="Redirect URI" hint="Register this URI in your IdP">
              <Input value={String(merged.redirectUri)} onChange={(v) => set("redirectUri", v)} placeholder="https://your-domain.com/auth/callback" />
            </Field>
            <Field label="Scopes" hint="Space-separated list of requested scopes">
              <Input value={String(merged.scopes)} onChange={(v) => set("scopes", v)} placeholder="openid email profile groups" />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="IdP Metadata URL" hint="SAML 2.0 metadata XML endpoint from your IdP">
              <Input value={String(merged.samlMetadataUrl)} onChange={(v) => set("samlMetadataUrl", v)} placeholder="https://your-idp.com/saml/metadata" />
            </Field>
            <Field label="SP Entity ID" hint="Your application's SAML entity identifier">
              <Input value={String(merged.samlEntityId)} onChange={(v) => set("samlEntityId", v)} placeholder="urn:cryptoguard:saml:sp" />
            </Field>
            <Field label="Assertion Consumer Service (ACS) URL" hint="Your application's SAML callback URL">
              <Input value={String(merged.samlAcsUrl)} onChange={(v) => set("samlAcsUrl", v)} placeholder="https://your-domain.com/saml/acs" />
            </Field>
          </div>
        )}

        <div className="border-t border-border pt-6 space-y-4">
          <p className="text-sm font-medium text-foreground">Access Control</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Allowed Email Domains" hint="Only users from these domains can sign in (comma-separated, empty = any)">
              <Input value={String(merged.allowedDomains)} onChange={(v) => set("allowedDomains", v)} placeholder="corp.example.com, subsidiary.example.com" />
            </Field>
            <Field label="Group / Role Claim Attribute" hint="Claim name carrying user groups from your IdP">
              <Input value={String(merged.groupAttribute)} onChange={(v) => set("groupAttribute", v)} placeholder="groups" />
            </Field>
            <Field label="Admin Group Name" hint="Users in this group receive admin privileges">
              <Input value={String(merged.adminGroup)} onChange={(v) => set("adminGroup", v)} placeholder="cryptoguard-admins" />
            </Field>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <SaveButton saving={mut.isPending} />
      </div>
    </form>
  );
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("policy");
  const ActiveTab = activeTab === "policy" ? PolicyTab : activeTab === "syslog" ? SyslogTab : SSOTab;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
          <Settings2 className="h-6 w-6 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Platform configuration, SSO, and log forwarding</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <aside className="w-56 shrink-0 space-y-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-left transition-all ${active ? "bg-sidebar-accent text-primary border-l-2 border-primary pl-[10px]" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 border-l-2 border-transparent pl-[10px]"}`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className="flex-1 font-medium">{tab.label}</span>
                {active && <ChevronRight className="h-3 w-3 text-primary/60" />}
              </button>
            );
          })}
        </aside>

        {/* Content panel */}
        <div className="flex-1 bg-card border border-card-border rounded-lg p-6">
          {TABS.filter((t) => t.id === activeTab).map((tab) => (
            <div key={tab.id} className="mb-6">
              <h2 className="text-base font-semibold text-foreground">{tab.label}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{tab.description}</p>
            </div>
          ))}
          <ActiveTab />
        </div>
      </div>
    </div>
  );
}
