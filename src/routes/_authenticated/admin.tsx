import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GoogleMap } from "@/components/GoogleMap";
import { toast } from "sonner";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Loader2, Check, X, FileText, IdCard, LayoutDashboard, Users, MapPin,
  Briefcase, CalendarCheck, ClipboardList, Shield, ShieldOff, Power, CreditCard, Home, LogOut,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Nearby" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type Tab = "overview" | "requests" | "settings" | "users" | "providers" | "map" | "bookings";

const tabs: { id: Tab; label: string; icon: any; group: "main" | "manage" | "system" }[] = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard, group: "main" },
  { id: "requests", label: "Provider Requests", icon: ClipboardList, group: "main" },
  { id: "bookings", label: "Bookings", icon: CalendarCheck, group: "main" },
  { id: "users", label: "Manage Users", icon: Users, group: "manage" },
  { id: "providers", label: "Manage Providers", icon: Briefcase, group: "manage" },
  { id: "map", label: "Manage Map", icon: MapPin, group: "manage" },
  { id: "settings", label: "Manage Payment Provider", icon: CreditCard, group: "system" },
];

function AdminPage() {
  const { user } = useSession();
  const { data: roles = [], isLoading: rolesLoading } = useRoles(user);
  const isAdmin = roles.includes("admin");
  const [tab, setTab] = useState<Tab>("overview");

  if (rolesLoading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin size-6 text-brand/40" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-black">Admins only</h1>
          <p className="text-sm text-brand/60 mt-2">Ask a workspace admin to grant you the admin role.</p>
          <Link to="/" className="inline-block mt-4 px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-bold">Home</Link>
        </div>
      </div>
    );
  }

  const groups: { key: "main" | "manage" | "system"; label: string }[] = [
    { key: "main", label: "Overview" },
    { key: "manage", label: "Management" },
    { key: "system", label: "System" },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-canvas">
        <Sidebar collapsible="icon">
          <SidebarContent>
            <div className="px-4 pt-5 pb-3 flex items-center gap-2">
              <div className="size-8 rounded-lg bg-brand grid place-items-center text-white"><Shield className="size-4" /></div>
              <div className="group-data-[collapsible=icon]:hidden">
                <div className="text-[10px] font-bold uppercase tracking-widest text-brand/40">Nearby</div>
                <div className="text-sm font-black">Admin Console</div>
              </div>
            </div>
            {groups.map((g) => (
              <SidebarGroup key={g.key}>
                <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {tabs.filter((t) => t.group === g.key).map((t) => {
                      const Icon = t.icon;
                      return (
                        <SidebarMenuItem key={t.id}>
                          <SidebarMenuButton isActive={tab === t.id} onClick={() => setTab(t.id)}>
                            <Icon className="size-4" />
                            <span>{t.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/"><Home className="size-4" /><span>Back to app</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={async () => { await supabase.auth.signOut(); location.href = "/auth"; }}>
                  <LogOut className="size-4" /><span>Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-brand/5 bg-white/90 backdrop-blur sticky top-0 z-20 px-4">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-widest text-brand/40">Admin</div>
              <h1 className="text-sm font-black truncate">{tabs.find((t) => t.id === tab)?.label}</h1>
            </div>
          </header>
          <main className="flex-1 px-4 py-5 max-w-6xl w-full mx-auto">
            {tab === "overview" && <OverviewTab />}
            {tab === "requests" && <RequestsTab />}
            {tab === "settings" && <SettingsTab />}
            {tab === "users" && <UsersTab />}
            {tab === "providers" && <ProvidersTab />}
            {tab === "map" && <MapTab />}
            {tab === "bookings" && <BookingsTab />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

/* ---------- Overview ---------- */
function OverviewTab() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, providers, bookings, reviews, pending] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("provider_profiles").select("id", { count: "exact", head: true }),
        supabase.from("bookings").select("id", { count: "exact", head: true }),
        supabase.from("reviews").select("id", { count: "exact", head: true }),
        supabase.from("provider_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      const { data: revenueRows } = await supabase.from("bookings").select("total_price").eq("status", "completed");
      const revenue = (revenueRows ?? []).reduce((s: number, b: any) => s + (Number(b.total_price) || 0), 0);
      return {
        users: users.count ?? 0,
        providers: providers.count ?? 0,
        bookings: bookings.count ?? 0,
        reviews: reviews.count ?? 0,
        pending: pending.count ?? 0,
        revenue,
      };
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <BigStat label="Total users" value={stats?.users ?? 0} />
        <BigStat label="Providers" value={stats?.providers ?? 0} />
        <BigStat label="Bookings" value={stats?.bookings ?? 0} />
        <BigStat label="Reviews" value={stats?.reviews ?? 0} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-amber-500 text-white">
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/80">Pending requests</div>
          <div className="font-mono font-black text-3xl">{stats?.pending ?? 0}</div>
        </div>
        <div className="p-4 rounded-2xl bg-accent text-white">
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/80">Revenue (completed)</div>
          <div className="font-mono font-black text-3xl">${(stats?.revenue ?? 0).toFixed(0)}</div>
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_settings" as any)
        .select("*")
        .eq("id", "payments")
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        id: "payments",
        provider: "none",
        mode: "sandbox",
        publishable_key: "",
        currency: "USD",
        platform_fee_percent: 10,
        payment_enabled: false,
      }) as any;
    },
  });

  const [form, setForm] = useState({
    provider: "none",
    mode: "sandbox",
    publishable_key: "",
    currency: "USD",
    platform_fee_percent: "10",
    payment_enabled: false,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        provider: settings.provider ?? "none",
        mode: settings.mode ?? "sandbox",
        publishable_key: settings.publishable_key ?? "",
        currency: settings.currency ?? "USD",
        platform_fee_percent: String(settings.platform_fee_percent ?? 10),
        payment_enabled: !!settings.payment_enabled,
      });
    }
  }, [settings]);

  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const fee = Number(form.platform_fee_percent || 0);
    if (Number.isNaN(fee) || fee < 0 || fee > 100) return toast.error("Platform fee must be 0–100");
    if (form.provider !== "none" && !form.publishable_key.trim())
      return toast.error("Add a publishable key for the selected provider");

    setSaving(true);
    try {
      const { error } = await supabase.from("admin_settings" as any).upsert({
        id: "payments",
        provider: form.provider,
        mode: form.mode,
        publishable_key: form.publishable_key.trim() || null,
        currency: form.currency.toUpperCase(),
        platform_fee_percent: fee,
        payment_enabled: form.payment_enabled,
      });
      if (error) throw error;
      toast.success("Payment provider updated");
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 grid place-items-center"><Loader2 className="animate-spin size-5 text-brand/40" /></div>;
  }

  const providers = [
    { id: "none", label: "Disabled", desc: "Bookings run as free requests." },
    { id: "stripe", label: "Stripe", desc: "Cards, wallets, subscriptions. Global reach." },
    { id: "paddle", label: "Paddle", desc: "Merchant of record. Handles tax + compliance." },
    { id: "manual", label: "Manual / Cash", desc: "Providers collect payment in person." },
  ] as const;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-2xl bg-white p-5 border border-brand/5 shadow-sm">
        <div className="text-[10px] uppercase tracking-[0.24em] text-brand/50 font-bold">Payment Provider</div>
        <h2 className="mt-1 text-lg font-black">Configure how customers pay</h2>
        <p className="mt-1 text-sm text-brand/60">
          Live status: <span className={`font-bold ${form.payment_enabled ? "text-green-600" : "text-brand/60"}`}>
            {form.payment_enabled ? `${form.provider.toUpperCase()} · ${form.mode}` : "Payments off"}
          </span>
        </p>
      </div>

      <form onSubmit={save} className="rounded-2xl bg-white p-5 border border-brand/5 shadow-sm space-y-5">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-brand/40 mb-2">Provider</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {providers.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setForm({ ...form, provider: p.id })}
                className={`text-left p-3 rounded-xl border-2 transition ${
                  form.provider === p.id ? "border-accent bg-accent/5" : "border-brand/10 hover:border-brand/20"
                }`}
              >
                <div className="font-bold text-sm">{p.label}</div>
                <div className="text-xs text-brand/60 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest font-bold text-brand/40">Mode</span>
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
              className="mt-1 w-full rounded-xl border border-brand/10 bg-canvas px-3 py-2.5 text-sm outline-none focus:border-accent"
            >
              <option value="sandbox">Test (sandbox)</option>
              <option value="live">Live</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest font-bold text-brand/40">Currency</span>
            <input
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              maxLength={3}
              className="mt-1 w-full rounded-xl border border-brand/10 bg-canvas px-3 py-2.5 text-sm uppercase outline-none focus:border-accent"
            />
          </label>
        </div>

        {form.provider !== "none" && form.provider !== "manual" && (
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest font-bold text-brand/40">
              Publishable key ({form.provider})
            </span>
            <input
              value={form.publishable_key}
              onChange={(e) => setForm({ ...form, publishable_key: e.target.value })}
              placeholder={form.provider === "stripe" ? "pk_test_..." : "pdl_pk_..."}
              className="mt-1 w-full rounded-xl border border-brand/10 bg-canvas px-3 py-2.5 text-sm font-mono outline-none focus:border-accent"
            />
            <span className="text-[11px] text-brand/50 mt-1 block">
              Secret keys are stored separately as project secrets — never enter them here.
            </span>
          </label>
        )}

        <label className="block">
          <span className="text-[10px] uppercase tracking-widest font-bold text-brand/40">Platform fee %</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={form.platform_fee_percent}
            onChange={(e) => setForm({ ...form, platform_fee_percent: e.target.value })}
            className="mt-1 w-full rounded-xl border border-brand/10 bg-canvas px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
        </label>

        <label className="flex items-start gap-3 p-3 rounded-xl border border-brand/10 bg-canvas cursor-pointer">
          <input
            type="checkbox"
            checked={form.payment_enabled}
            onChange={(e) => setForm({ ...form, payment_enabled: e.target.checked })}
            className="mt-0.5 size-4"
          />
          <div>
            <div className="font-bold text-sm">Accept payments in the app</div>
            <div className="text-xs text-brand/60">When off, customers request bookings for free.</div>
          </div>
        </label>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 hover:bg-orange-500 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save configuration
        </button>
      </form>
    </div>
  );
}

/* ---------- Requests ---------- */
function RequestsTab() {
  const qc = useQueryClient();
  const { data: requests = [] } = useQuery({
    queryKey: ["admin-provider-requests"],
    queryFn: async () => {
      const { data } = await supabase.from("provider_requests").select("*").order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const viewDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from("provider-docs").createSignedUrl(path, 300);
    if (error || !data) return toast.error(error?.message ?? "Cannot open");
    window.open(data.signedUrl, "_blank");
  };
  const approve = async (id: string) => {
    const { error } = await supabase.rpc("approve_provider_request", { _request_id: id });
    if (error) return toast.error(error.message);
    toast.success("Provider approved");
    qc.invalidateQueries();
  };
  const reject = async (id: string) => {
    const notes = prompt("Reason for rejection (shown to applicant):", "");
    if (notes === null) return;
    const { error } = await supabase.rpc("reject_provider_request", { _request_id: id, _notes: notes });
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    qc.invalidateQueries();
  };

  if (requests.length === 0) return <Empty label="No provider requests yet." />;

  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <div key={r.id} className="bg-surface p-3 rounded-xl border border-brand/5 space-y-2">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{r.business_name}</div>
              <div className="text-xs text-brand/60 truncate">{[r.city, r.zip].filter(Boolean).join(" · ") || "—"}</div>
              {r.phone && <div className="text-xs text-brand/60">📞 {r.phone}</div>}
            </div>
            <StatusPill status={r.status} />
          </div>
          {r.bio && <p className="text-xs text-brand/70 line-clamp-2">{r.bio}</p>}
          <div className="flex gap-2 flex-wrap">
            {r.service_id_url && (
              <button onClick={() => viewDoc(r.service_id_url)} className="text-[10px] font-bold uppercase flex items-center gap-1 px-2 py-1 rounded bg-canvas border border-brand/10">
                <IdCard className="size-3" /> Service ID
              </button>
            )}
            {r.national_id_url && (
              <button onClick={() => viewDoc(r.national_id_url)} className="text-[10px] font-bold uppercase flex items-center gap-1 px-2 py-1 rounded bg-canvas border border-brand/10">
                <FileText className="size-3" /> National ID
              </button>
            )}
          </div>
          {r.status === "pending" && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => approve(r.id)} className="flex-1 py-2 rounded-lg bg-green-600 text-white text-xs font-bold flex items-center justify-center gap-1">
                <Check className="size-3.5" /> Approve
              </button>
              <button onClick={() => reject(r.id)} className="flex-1 py-2 rounded-lg bg-red-600 text-white text-xs font-bold flex items-center justify-center gap-1">
                <X className="size-3.5" /> Reject
              </button>
            </div>
          )}
          {r.status === "rejected" && r.review_notes && (
            <div className="text-[11px] text-red-700 bg-red-50 rounded p-2">Note: {r.review_notes}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Users ---------- */
function UsersTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const setRole = async (uid: string, role: "admin" | "provider" | "customer", grant: boolean) => {
    const { error } = await supabase.rpc("admin_set_user_role", { _user_id: uid, _role: role, _grant: grant });
    if (error) return toast.error(error.message);
    toast.success(`${grant ? "Granted" : "Revoked"} ${role}`);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const filtered = users.filter((u: any) =>
    !q || [u.email, u.full_name, u.phone].filter(Boolean).some((x: string) => x.toLowerCase().includes(q.toLowerCase())),
  );

  if (isLoading) return <div className="grid place-items-center py-16"><Loader2 className="size-6 animate-spin text-brand/40" /></div>;

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, email, phone…"
        className="w-full bg-surface border border-brand/10 rounded-xl py-2.5 px-3 text-sm outline-none"
      />
      {filtered.length === 0 && <Empty label="No users match." />}
      {filtered.map((u: any) => {
        const has = (r: string) => (u.roles ?? []).includes(r);
        return (
          <div key={u.id} className="bg-surface p-3 rounded-xl border border-brand/5">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{u.full_name ?? "(no name)"}</div>
                <div className="text-xs text-brand/60 truncate">{u.email}</div>
                {u.phone && <div className="text-xs text-brand/60">📞 {u.phone}</div>}
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {(u.roles ?? []).map((r: string) => (
                  <span key={r} className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-brand/5">{r}</span>
                ))}
              </div>
            </div>
            <div className="mt-3 flex gap-1.5 flex-wrap">
              {(["admin", "provider", "customer"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(u.id, r, !has(r))}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                    has(r) ? "bg-brand text-white" : "bg-canvas border border-brand/10 text-brand/60"
                  }`}
                >
                  {has(r) ? <ShieldOff className="size-3" /> : <Shield className="size-3" />}
                  {has(r) ? `Remove ${r}` : `Make ${r}`}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Providers ---------- */
function ProvidersTab() {
  const qc = useQueryClient();
  const { data: providers = [] } = useQuery({
    queryKey: ["admin-providers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_profiles")
        .select("id,business_name,city,is_active,hourly_rate,created_at")
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const toggle = async (id: string, is_active: boolean) => {
    const { error } = await supabase.from("provider_profiles").update({ is_active: !is_active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-providers"] });
  };

  if (providers.length === 0) return <Empty label="No providers yet." />;
  return (
    <div className="space-y-2">
      {providers.map((p: any) => (
        <div key={p.id} className="bg-surface p-3 rounded-xl border border-brand/5 flex justify-between items-center gap-2">
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{p.business_name}</div>
            <div className="text-xs text-brand/60 truncate">
              {p.city ?? "—"}{p.hourly_rate ? ` · $${Number(p.hourly_rate).toFixed(0)}/hr` : ""}
            </div>
          </div>
          <button
            onClick={() => toggle(p.id, p.is_active)}
            className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2.5 py-1.5 rounded ${p.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
          >
            <Power className="size-3" /> {p.is_active ? "Active" : "Suspended"}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Map ---------- */
function MapTab() {
  const { data: providers = [] } = useQuery({
    queryKey: ["admin-map-providers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_profiles")
        .select("id,business_name,city,latitude,longitude,is_active")
        .not("latitude", "is", null)
        .not("longitude", "is", null);
      return (data ?? []) as any[];
    },
  });

  const center = providers.length
    ? { lat: providers[0].latitude, lng: providers[0].longitude }
    : { lat: 40.7128, lng: -74.006 };

  return (
    <div className="space-y-3">
      <div className="h-[380px] rounded-2xl overflow-hidden border border-brand/10">
        <GoogleMap
          center={center}
          zoom={6}
          markers={providers.map((p: any) => ({ id: p.id, lat: p.latitude, lng: p.longitude, label: p.business_name }))}
        />
      </div>
      <div className="text-xs text-brand/60">
        Showing {providers.length} pinned provider{providers.length === 1 ? "" : "s"}.
        Providers without a pinned location won't appear here — remind them to set their service area.
      </div>
    </div>
  );
}

/* ---------- Bookings ---------- */
function BookingsTab() {
  const [filter, setFilter] = useState<string>("all");
  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-bookings-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id,status,scheduled_at,total_price,duration_hours,address,provider:provider_profiles!bookings_provider_id_fkey(business_name),customer:profiles!bookings_customer_id_fkey(full_name)")
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });
  const filtered = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {["all", "pending", "accepted", "completed", "rejected", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase ${filter === s ? "bg-brand text-white" : "bg-surface border border-brand/10 text-brand/60"}`}
          >
            {s}
          </button>
        ))}
      </div>
      {filtered.length === 0 && <Empty label="No bookings match." />}
      {filtered.map((b: any) => (
        <div key={b.id} className="bg-surface p-3 rounded-xl border border-brand/5">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{b.provider?.business_name ?? "—"}</div>
              <div className="text-xs text-brand/60 truncate">for {b.customer?.full_name ?? "customer"}</div>
              <div className="text-xs text-brand/60 mt-0.5">{new Date(b.scheduled_at).toLocaleString()} · {b.duration_hours}h</div>
              {b.address && <div className="text-xs text-brand/60 truncate">📍 {b.address}</div>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <StatusPill status={b.status} />
              {b.total_price && <span className="font-mono font-bold text-xs text-accent">${Number(b.total_price).toFixed(0)}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Shared bits ---------- */
function BigStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-4 rounded-2xl bg-surface border border-brand/5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-brand/40">{label}</div>
      <div className="font-mono font-black text-3xl mt-1">{value}</div>
    </div>
  );
}
function Empty({ label }: { label: string }) {
  return <div className="text-xs text-brand/50 bg-surface p-4 rounded-xl border border-brand/5 text-center">{label}</div>;
}
function StatusPill({ status }: { status: string }) {
  const s: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    accepted: "bg-blue-100 text-blue-700",
    rejected: "bg-red-100 text-red-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-gray-100 text-gray-700",
  };
  return <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${s[status] ?? "bg-brand/5"}`}>{status}</span>;
}
