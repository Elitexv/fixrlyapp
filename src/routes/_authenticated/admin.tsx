import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { approveWithdrawal } from "@/lib/withdrawals.functions";
import { GoogleMap } from "@/components/GoogleMap";
import { toast } from "sonner";
import { getPaymentStatusBadge, getPaymentStatusLabel } from "@/lib/booking-payment";
import { formatMoney, useCurrency } from "@/lib/currency";
import { formatRelativeTime } from "@/lib/time";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Check, X, FileText, IdCard, LayoutDashboard, Users, MapPin, Banknote,
  Briefcase, CalendarCheck, ClipboardList, Shield, ShieldOff, Power, CreditCard, Home, LogOut, Inbox,
} from "lucide-react";
import { Panel, Tile, StatCard, StatusBadge, Eyebrow, PrimaryButton, SecondaryButton, FormField, TextAreaField, EmptyState, PageSpinner, InlineSpinner } from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

type Tab = "overview" | "requests" | "settings" | "users" | "providers" | "map" | "bookings" | "withdrawals";

const tabs: { id: Tab; label: string; icon: any; group: "main" | "manage" | "system" }[] = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard, group: "main" },
  { id: "requests", label: "Provider Requests", icon: ClipboardList, group: "main" },
  { id: "bookings", label: "Bookings", icon: CalendarCheck, group: "main" },
  { id: "users", label: "Manage Users", icon: Users, group: "manage" },
  { id: "providers", label: "Manage Providers", icon: Briefcase, group: "manage" },
  { id: "map", label: "Manage Map", icon: MapPin, group: "manage" },
  { id: "withdrawals", label: "Withdrawals", icon: Banknote, group: "manage" },
  { id: "settings", label: "Manage Payment Provider", icon: CreditCard, group: "system" },
];

function AdminPage() {
  const { user } = useSession();
  const { data: roles = [], isLoading: rolesLoading } = useRoles(user);
  const isAdmin = roles.includes("admin");
  const [tab, setTab] = useState<Tab>("overview");

  if (rolesLoading) {
    return <PageSpinner />;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-black tracking-tight">Admins only</h1>
          <p className="text-sm text-brand/60 mt-2">Ask a workspace admin to grant you the admin role.</p>
          <Link to="/" className="mt-4 inline-flex items-center justify-center rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500">
            Home
          </Link>
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
        <AdminSidebarNav tab={tab} setTab={setTab} groups={groups} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center gap-3 border-b border-soft bg-surface/90 backdrop-blur sticky top-0 z-20 px-4">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              <Eyebrow>Admin</Eyebrow>
              <h1 className="text-base font-black tracking-tight truncate">{tabs.find((t) => t.id === tab)?.label}</h1>
            </div>
            <button
              type="button"
              onClick={async () => { await signOut(firebaseAuth); location.href = "/auth"; }}
              aria-label="Sign out"
              className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider text-brand/60 transition hover:bg-canvas hover:text-red-600"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </header>
          <main className="flex-1 px-4 py-6 max-w-6xl w-full mx-auto">
            {tab === "overview" && <OverviewTab />}
            {tab === "requests" && <RequestsTab />}
            {tab === "settings" && <SettingsTab />}
            {tab === "users" && <UsersTab />}
            {tab === "providers" && <ProvidersTab />}
            {tab === "map" && <MapTab />}
            {tab === "bookings" && <BookingsTab />}
            {tab === "withdrawals" && <WithdrawalsTab />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

// Split out so useSidebar() can close the mobile off-canvas drawer after a
// nav selection — SidebarMenuButton has no such behavior built in, and
// AdminPage itself renders the SidebarProvider that owns this context, so
// it can't call the hook directly (the provider doesn't exist yet during
// AdminPage's own render).
function AdminSidebarNav({
  tab, setTab, groups,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  groups: { key: "main" | "manage" | "system"; label: string }[];
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const selectTab = (t: Tab) => {
    setTab(t);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="px-4 pt-5 pb-3 flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-primary grid place-items-center text-primary-foreground shadow-lg shadow-primary/20"><Shield className="size-4" /></div>
          <div className="group-data-[collapsible=icon]:hidden">
            <Eyebrow>Fixrly</Eyebrow>
            <div className="text-sm font-black tracking-tight">Admin Console</div>
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
                      <SidebarMenuButton isActive={tab === t.id} onClick={() => selectTab(t.id)}>
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
            <SidebarMenuButton onClick={async () => { await signOut(firebaseAuth); location.href = "/auth"; }}>
              <LogOut className="size-4" /><span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/* ---------- Overview ---------- */
function OverviewTab() {
  const currency = useCurrency();
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total users" value={stats?.users ?? 0} />
        <StatCard label="Providers" value={stats?.providers ?? 0} />
        <StatCard label="Bookings" value={stats?.bookings ?? 0} />
        <StatCard label="Reviews" value={stats?.reviews ?? 0} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl bg-amber-500 p-5 text-white">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/80">Pending requests</div>
          <div className="mt-2 font-mono font-black text-3xl">{stats?.pending ?? 0}</div>
        </div>
        <div className="rounded-3xl bg-accent p-5 text-white">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/80">Revenue (completed)</div>
          <div className="mt-2 font-mono font-black text-3xl">{formatMoney(stats?.revenue ?? 0, currency)}</div>
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
        currency: "NGN",
        platform_fee_percent: 10,
        payment_enabled: false,
      }) as any;
    },
  });

  const [form, setForm] = useState({
    provider: "none",
    mode: "sandbox",
    publishable_key: "",
    currency: "NGN",
    platform_fee_percent: "10",
    payment_enabled: false,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        provider: settings.provider ?? "none",
        mode: settings.mode ?? "sandbox",
        publishable_key: settings.publishable_key ?? "",
        currency: settings.currency ?? "NGN",
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
    return <InlineSpinner />;
  }

  const providers = [
    { id: "none", label: "Disabled", desc: "Bookings run as free requests." },
    { id: "stripe", label: "Stripe", desc: "Cards, wallets, subscriptions. Global reach." },
    { id: "paddle", label: "Paddle", desc: "Merchant of record. Handles tax + compliance." },
    { id: "paystack", label: "Paystack", desc: "Popular Nigerian cards and bank transfers." },
    { id: "flutterwave", label: "Flutterwave", desc: "Cards, bank transfers, and mobile money." },
    { id: "manual", label: "Manual / Cash", desc: "Providers collect payment in person." },
  ] as const;

  return (
    <div className="space-y-4 max-w-2xl">
      <Panel className="p-5">
        <Eyebrow>Payment Provider</Eyebrow>
        <h2 className="mt-1 text-lg font-black tracking-tight">Configure how customers pay</h2>
        <p className="mt-1 text-sm text-brand/60">
          Live status: <span className={`font-bold ${form.payment_enabled ? "text-green-600" : "text-brand/60"}`}>
            {form.payment_enabled ? `${form.provider.toUpperCase()} · ${form.mode}` : "Payments off"}
          </span>
        </p>
      </Panel>

      <Panel as="form" onSubmit={save} className="p-5 space-y-5">
        <div>
          <Eyebrow className="mb-2">Provider</Eyebrow>
          <div className="grid sm:grid-cols-2 gap-2">
            {providers.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setForm({ ...form, provider: p.id })}
                className={`text-left p-3 rounded-2xl border-2 transition ${
                  form.provider === p.id ? "border-accent bg-accent/5" : "border-brand/10 hover:border-brand/20"
                }`}
              >
                <div className="text-sm font-bold text-brand">{p.label}</div>
                <div className="mt-0.5 text-xs text-brand/60">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Eyebrow className="mb-1.5">Mode</Eyebrow>
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
              className="w-full rounded-xl bg-canvas border border-transparent py-2.5 px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="sandbox">Test (sandbox)</option>
              <option value="live">Live</option>
            </select>
          </label>
          <FormField label="Currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v.toUpperCase() })} className="[&_input]:uppercase" />
        </div>

        {form.provider !== "none" && form.provider !== "manual" && (
          <div>
            <FormField
              label={`Publishable key (${form.provider})`}
              value={form.publishable_key}
              onChange={(v) => setForm({ ...form, publishable_key: v })}
              placeholder={
                form.provider === "stripe"
                  ? "pk_test_..."
                  : form.provider === "paystack"
                    ? "pk_test_..."
                    : form.provider === "flutterwave"
                      ? "FLWPUBK_TEST_..."
                      : "pdl_pk_..."
              }
              className="[&_input]:font-mono"
            />
            <span className="text-[11px] text-brand/50 mt-1.5 block">
              Secret keys are stored separately as project secrets — never enter them here.
            </span>
          </div>
        )}

        <FormField
          label="Platform fee %"
          type="number"
          value={form.platform_fee_percent}
          onChange={(v) => setForm({ ...form, platform_fee_percent: v })}
        />

        <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-brand/10 bg-canvas cursor-pointer">
          <input
            type="checkbox"
            checked={form.payment_enabled}
            onChange={(e) => setForm({ ...form, payment_enabled: e.target.checked })}
            className="mt-0.5 size-4 rounded border-brand/20 text-accent focus:ring-accent"
          />
          <div>
            <div className="text-sm font-bold text-brand">Accept payments in the app</div>
            <div className="text-xs text-brand/60">When off, customers request bookings for free.</div>
          </div>
        </label>

        <PrimaryButton type="submit" disabled={saving} loading={saving} className="w-full">
          Save configuration
        </PrimaryButton>
      </Panel>
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

  const [rejecting, setRejecting] = useState<{ id: string; businessName: string } | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

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
  const confirmReject = async () => {
    if (!rejecting) return;
    setRejectSaving(true);
    const { error } = await supabase.rpc("reject_provider_request", { _request_id: rejecting.id, _notes: rejectNotes });
    setRejectSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    setRejecting(null);
    setRejectNotes("");
    qc.invalidateQueries();
  };

  if (requests.length === 0) return <EmptyState icon={Inbox} title="No provider requests yet" />;

  return (
    <div className="space-y-3">
      <Dialog open={!!rejecting} onOpenChange={(open) => { if (!open) { setRejecting(null); setRejectNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.businessName}</DialogTitle>
            <DialogDescription>This reason is shown to the applicant.</DialogDescription>
          </DialogHeader>
          <TextAreaField
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Reason for rejection…"
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <SecondaryButton type="button" onClick={() => { setRejecting(null); setRejectNotes(""); }}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="button" onClick={confirmReject} disabled={rejectSaving} loading={rejectSaving}>
              Reject request
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {requests.map((r) => (
        <Tile key={r.id} className="space-y-2 hover:shadow-sm">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{r.business_name}</div>
              <div className="text-xs text-brand/60 truncate">{[r.city, r.zip].filter(Boolean).join(" · ") || "—"}</div>
              {r.phone && <div className="text-xs text-brand/60">📞 {r.phone}</div>}
            </div>
            <StatusBadge status={r.status} />
          </div>
          {r.bio && <p className="text-xs text-brand/70 line-clamp-2">{r.bio}</p>}
          <div className="flex gap-2 flex-wrap">
            {r.service_id_url && (
              <button onClick={() => viewDoc(r.service_id_url)} className="text-[10px] font-bold uppercase flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-canvas border border-brand/10">
                <IdCard className="size-3" /> Service ID
              </button>
            )}
            {r.national_id_url && (
              <button onClick={() => viewDoc(r.national_id_url)} className="text-[10px] font-bold uppercase flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-canvas border border-brand/10">
                <FileText className="size-3" /> National ID
              </button>
            )}
          </div>
          {r.status === "pending" && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => approve(r.id)} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition hover:bg-green-500">
                <Check className="size-3.5" /> Approve
              </button>
              <button onClick={() => setRejecting({ id: r.id, businessName: r.business_name })} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition hover:bg-red-500">
                <X className="size-3.5" /> Reject
              </button>
            </div>
          )}
          {r.status === "rejected" && r.review_notes && (
            <div className="text-[11px] text-red-700 bg-red-50 rounded-lg p-2.5">Note: {r.review_notes}</div>
          )}
        </Tile>
      ))}
    </div>
  );
}

/* ---------- Withdrawals ---------- */
function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  return `${"•".repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`;
}

function WithdrawalsTab() {
  const qc = useQueryClient();
  const approve = useServerFn(approveWithdrawal);
  const { data: withdrawals = [] } = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select(
          "*, provider:provider_profiles!withdrawal_requests_provider_id_fkey(business_name), payout_account:provider_payout_accounts!withdrawal_requests_payout_account_id_fkey(bank_name,account_number,account_name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [rejecting, setRejecting] = useState<{ id: string; providerName: string } | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const doApprove = async (id: string) => {
    setApprovingId(id);
    try {
      await approve({ data: { withdrawalId: id } });
      toast.success("Transfer initiated");
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message ?? "Approval failed");
    } finally {
      setApprovingId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    setRejectSaving(true);
    const { error } = await supabase.rpc("reject_withdrawal", { _id: rejecting.id, _notes: rejectNotes });
    setRejectSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    setRejecting(null);
    setRejectNotes("");
    qc.invalidateQueries();
  };

  if (withdrawals.length === 0) return <EmptyState icon={Inbox} title="No withdrawal requests yet" />;

  return (
    <div className="space-y-3">
      <Dialog open={!!rejecting} onOpenChange={(open) => { if (!open) { setRejecting(null); setRejectNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.providerName}'s request</DialogTitle>
            <DialogDescription>This reason is shown to the provider.</DialogDescription>
          </DialogHeader>
          <TextAreaField
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Reason for rejection…"
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <SecondaryButton type="button" onClick={() => { setRejecting(null); setRejectNotes(""); }}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="button" onClick={confirmReject} disabled={rejectSaving} loading={rejectSaving}>
              Reject request
            </PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {withdrawals.map((w) => (
        <Tile key={w.id} className="space-y-2 hover:shadow-sm">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{w.provider?.business_name ?? "Provider"}</div>
              <div className="font-mono text-sm font-bold text-accent">{formatMoney(w.amount, w.currency)}</div>
              <div className="text-xs text-brand/60 truncate">
                {w.payout_account?.bank_name} · {w.payout_account?.account_number ? maskAccountNumber(w.payout_account.account_number) : "—"}
              </div>
              <div className="text-[10px] text-brand/40">{formatRelativeTime(w.created_at)}</div>
            </div>
            <StatusBadge status={w.status} />
          </div>
          {(w.status === "processing" || w.status === "paid") && w.paystack_transfer_reference && (
            <div className="text-[11px] text-brand/50">Ref: {w.paystack_transfer_reference}</div>
          )}
          {(w.status === "rejected" || w.status === "failed") && w.admin_notes && (
            <div className="text-[11px] text-red-700 bg-red-50 rounded-lg p-2.5">Note: {w.admin_notes}</div>
          )}
          {w.status === "pending" && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => doApprove(w.id)}
                disabled={approvingId === w.id}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition hover:bg-green-500 disabled:opacity-60"
              >
                {approvingId === w.id ? "Processing…" : (<><Check className="size-3.5" /> Approve</>)}
              </button>
              <button
                onClick={() => setRejecting({ id: w.id, providerName: w.provider?.business_name ?? "this provider" })}
                disabled={approvingId === w.id}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition hover:bg-red-500 disabled:opacity-60"
              >
                <X className="size-3.5" /> Reject
              </button>
            </div>
          )}
        </Tile>
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

  if (isLoading) return <InlineSpinner />;

  return (
    <div className="space-y-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, email, phone…"
        className="w-full bg-surface border border-brand/10 rounded-xl py-2.5 px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      {filtered.length === 0 && <EmptyState icon={Users} title="No users match" />}
      {filtered.map((u: any) => {
        const has = (r: string) => (u.roles ?? []).includes(r);
        return (
          <Tile key={u.id} className="hover:shadow-sm">
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
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                    has(r) ? "bg-accent text-white" : "bg-canvas border border-brand/10 text-brand/60 hover:border-brand/20"
                  }`}
                >
                  {has(r) ? <ShieldOff className="size-3" /> : <Shield className="size-3" />}
                  {has(r) ? `Remove ${r}` : `Make ${r}`}
                </button>
              ))}
            </div>
          </Tile>
        );
      })}
    </div>
  );
}

/* ---------- Providers ---------- */
function ProvidersTab() {
  const qc = useQueryClient();
  const currency = useCurrency();
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

  if (providers.length === 0) return <EmptyState icon={Briefcase} title="No providers yet" />;
  return (
    <div className="space-y-3">
      {providers.map((p: any) => (
        <Tile key={p.id} className="flex justify-between items-center gap-2 hover:shadow-sm">
          <div className="min-w-0">
            <div className="font-bold text-sm truncate">{p.business_name}</div>
            <div className="text-xs text-brand/60 truncate">
              {p.city ?? "—"}{p.hourly_rate ? ` · ${formatMoney(p.hourly_rate, currency)}/hr` : ""}
            </div>
          </div>
          <button
            onClick={() => toggle(p.id, p.is_active)}
            className={`flex items-center gap-1.5 shrink-0 text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-lg transition ${p.is_active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
          >
            <Power className="size-3" /> {p.is_active ? "Active" : "Suspended"}
          </button>
        </Tile>
      ))}
    </div>
  );
}

/* ---------- Map ---------- */
function MapTab() {
  const qc = useQueryClient();
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

  const { data: mapCfg } = useQuery({
    queryKey: ["admin-map-cfg"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_settings" as any)
        .select("publishable_key")
        .eq("id", "map")
        .maybeSingle();
      return (data ?? { publishable_key: "" }) as any;
    },
  });

  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setApiKey(mapCfg?.publishable_key ?? ""); }, [mapCfg]);

  const saveKey = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("admin_settings" as any).upsert({
      id: "map",
      provider: "google_maps",
      mode: "live",
      publishable_key: apiKey.trim() || null,
      currency: "NGN",
      platform_fee_percent: 0,
      payment_enabled: false,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Map key saved — reload to apply");
    qc.invalidateQueries({ queryKey: ["admin-map-cfg"] });
  };

  const center = providers.length
    ? { lat: providers[0].latitude, lng: providers[0].longitude }
    : { lat: 9.082, lng: 8.6753 };

  return (
    <div className="space-y-4">
      <Panel as="form" onSubmit={saveKey} className="p-5 space-y-3">
        <div>
          <Eyebrow>Google Maps</Eyebrow>
          <h2 className="mt-1 text-lg font-black tracking-tight">Manual API key</h2>
          <p className="text-xs text-brand/60 mt-1">
            Paste a browser-restricted Google Maps JavaScript API key. Leave blank to fall back to the built-in Lovable connector key.
          </p>
        </div>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
          className="w-full rounded-xl bg-canvas border border-transparent py-2.5 px-3 text-sm font-mono outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <div className="flex items-center gap-2">
          <PrimaryButton type="submit" disabled={saving} loading={saving} className="py-2.5">
            Save key
          </PrimaryButton>
          {apiKey && (
            <button
              type="button"
              onClick={() => { setApiKey(""); }}
              className="rounded-2xl border border-brand/10 px-4 py-2.5 text-xs font-bold uppercase transition hover:bg-brand/5"
            >
              Clear
            </button>
          )}
        </div>
      </Panel>

      <div className="h-[380px] rounded-3xl overflow-hidden border border-soft shadow-soft">
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
  const qc = useQueryClient();
  const currency = useCurrency();
  const [filter, setFilter] = useState<string>("all");
  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-bookings-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id,status,scheduled_at,created_at,total_price,duration_hours,address,payment_status,payment_provider,payment_reference,provider:provider_profiles!bookings_provider_id_fkey(business_name),customer:profiles!bookings_customer_id_profiles_fkey(full_name)")
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });
  const filtered = filter === "all" ? bookings : bookings.filter((b) => b.status === filter);

  const markPayment = async (id: string) => {
    const { error } = await supabase.from("bookings").update({ payment_status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Booking marked as paid");
    qc.invalidateQueries({ queryKey: ["admin-bookings-all"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {["all", "pending", "accepted", "completed", "rejected", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase ${filter === s ? "bg-accent text-white" : "bg-surface border border-brand/10 text-brand/60"}`}
          >
            {s}
          </button>
        ))}
      </div>
      {filtered.length === 0 && <EmptyState icon={CalendarCheck} title="No bookings match" />}
      {filtered.map((b: any) => (
        <Tile key={b.id} className="hover:shadow-sm">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{b.provider?.business_name ?? "—"}</div>
              <div className="text-xs text-brand/60 truncate">for {b.customer?.full_name ?? "customer"}</div>
              <div className="text-xs text-brand/60 mt-0.5">{new Date(b.scheduled_at).toLocaleString()}</div>
              <div className="text-[10px] text-brand/40 mt-0.5">Booked {formatRelativeTime(b.created_at)}</div>
              {b.address && <div className="text-xs text-brand/60 truncate">📍 {b.address}</div>}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <StatusBadge status={b.status} />
              {b.total_price && <span className="font-mono font-bold text-xs text-accent">{formatMoney(b.total_price, currency)}</span>}
              <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${getPaymentStatusBadge(b.payment_status)}`}>
                {getPaymentStatusLabel(b.payment_status)}
              </span>
              {b.payment_reference && <span className="text-[10px] text-brand/50">Ref: {b.payment_reference}</span>}
              {b.payment_status === "pending" && (
                <button onClick={() => markPayment(b.id)} className="rounded-lg bg-green-600 px-2.5 py-1.5 text-[10px] font-bold uppercase text-white transition hover:bg-green-500">
                  Mark paid
                </button>
              )}
            </div>
          </div>
        </Tile>
      ))}
    </div>
  );
}
