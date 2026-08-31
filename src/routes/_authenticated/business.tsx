import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/integrations/firebase/client";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles, useMyBusiness } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatMoney, useCurrency, currencySymbol } from "@/lib/currency";
import { formatRelativeTime } from "@/lib/time";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Briefcase, CalendarCheck, Users, Receipt, Home, LogOut, Copy, Plus, Trash2, Check,
} from "lucide-react";
import {
  Panel, Tile, StatusBadge, Eyebrow, PrimaryButton, SecondaryButton, TextField, TextAreaField,
  EmptyState, PageSpinner, InlineSpinner, useNeutralSidebarSurface,
} from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/business")({
  head: () => ({ meta: [{ title: "Business — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: BusinessPage,
});

type Tab = "jobs" | "staff" | "clients" | "invoices";
const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: "jobs", label: "Jobs & Schedule", icon: CalendarCheck },
  { id: "staff", label: "Staff", icon: Users },
  { id: "clients", label: "Clients", icon: Briefcase },
  { id: "invoices", label: "Invoices", icon: Receipt },
];

function BusinessPage() {
  const { user, loading: sessionLoading } = useSession();
  const { data: roles = [] } = useRoles(user);
  const { data: business, isLoading: businessLoading } = useMyBusiness(user, roles);
  const [tab, setTab] = useState<Tab>("jobs");
  useNeutralSidebarSurface();

  if (sessionLoading || businessLoading) {
    return <PageSpinner />;
  }

  if (!business) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <h1 className="text-xl font-black tracking-tight">No business yet</h1>
          <p className="text-sm text-brand/60 mt-2">
            You're not the owner or an active staff member of a provider business.
          </p>
          <Link to="/dashboard" className="mt-4 inline-flex items-center justify-center rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const canManage = business.role === "owner" || business.role === "dispatcher";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-canvas">
        <BusinessSidebarNav tab={tab} setTab={setTab} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center gap-3 border-b border-soft bg-surface/90 backdrop-blur sticky top-0 z-20 px-4">
            <SidebarTrigger />
            <div className="flex-1 min-w-0">
              <Eyebrow>Business</Eyebrow>
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
            {tab === "jobs" && <JobsTab providerId={business.providerId} canManage={canManage} myRole={business.role} myId={user!.id} />}
            {tab === "staff" && <StaffTab providerId={business.providerId} isOwner={business.role === "owner"} />}
            {tab === "clients" && <ClientsTab providerId={business.providerId} myId={user!.id} />}
            {tab === "invoices" && <InvoicesTab providerId={business.providerId} canManage={canManage} />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function BusinessSidebarNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const selectTab = (t: Tab) => {
    setTab(t);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar>
      <SidebarContent>
        <div className="px-4 pt-5 pb-3 flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-accent grid place-items-center text-white shadow-lg shadow-accent/20"><Briefcase className="size-4" /></div>
          <div>
            <Eyebrow>Fixrly</Eyebrow>
            <div className="text-sm font-black tracking-tight">Business</div>
          </div>
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {tabs.map((t) => {
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
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/dashboard"><Home className="size-4" /><span>Back to dashboard</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

/* ---------- Jobs & Schedule ---------- */
function JobsTab({ providerId, canManage, myRole, myId }: { providerId: string; canManage: boolean; myRole: string; myId: string }) {
  const qc = useQueryClient();
  const currency = useCurrency();
  const [staffFilter, setStaffFilter] = useState<string>("all");

  const { data: staff = [] } = useQuery({
    queryKey: ["business-staff", providerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_staff")
        .select("id,staff_user_id,role,status,invited_email,staff:profiles!provider_staff_staff_user_id_fkey(full_name)")
        .eq("provider_id", providerId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["business-jobs", providerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,status,scheduled_at,created_at,total_price,address,assigned_staff_id,customer:profiles!bookings_customer_id_profiles_fkey(full_name),category:service_categories(name,icon),assignee:profiles!bookings_assigned_staff_id_fkey(full_name)")
        .eq("provider_id", providerId)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filtered = staffFilter === "all"
    ? bookings
    : staffFilter === "unassigned"
      ? bookings.filter((b) => !b.assigned_staff_id)
      : bookings.filter((b) => b.assigned_staff_id === staffFilter);

  const visible = myRole === "technician" ? filtered.filter((b) => b.assigned_staff_id === myId) : filtered;

  const assign = async (bookingId: string, staffUserId: string | null) => {
    const { error } = await supabase.from("bookings").update({ assigned_staff_id: staffUserId }).eq("id", bookingId);
    if (error) return toast.error(error.message);
    toast.success(staffUserId ? "Job assigned" : "Unassigned");
    qc.invalidateQueries({ queryKey: ["business-jobs", providerId] });
  };

  const updateStatus = async (bookingId: string, status: "accepted" | "rejected" | "completed") => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", bookingId);
    if (error) return toast.error(error.message);
    toast.success(`Job ${status}`);
    qc.invalidateQueries({ queryKey: ["business-jobs", providerId] });
  };

  if (isLoading) return <InlineSpinner />;

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex gap-1.5 flex-wrap">
          {[{ id: "all", label: "All" }, { id: "unassigned", label: "Unassigned" }, ...staff.map((s: any) => ({ id: s.staff_user_id, label: s.staff?.full_name ?? s.invited_email }))].map((f) => (
            <button
              key={f.id}
              onClick={() => setStaffFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase ${staffFilter === f.id ? "bg-accent text-white" : "bg-surface border border-brand/10 text-brand/60"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 && <EmptyState icon={CalendarCheck} title="No jobs match" />}
      {visible.map((b) => (
        <Tile key={b.id} className="hover:shadow-sm">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <Eyebrow>{b.category?.icon} {b.category?.name}</Eyebrow>
              <div className="font-bold text-sm truncate mt-1">{b.customer?.full_name ?? "Customer"}</div>
              <div className="text-xs text-brand/60 mt-0.5">{new Date(b.scheduled_at).toLocaleString()}</div>
              {b.address && <div className="text-xs text-brand/60 truncate">📍 {b.address}</div>}
              <div className="text-[10px] text-brand/40 mt-0.5">Booked {formatRelativeTime(b.created_at)}</div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <StatusBadge status={b.status} />
              {b.total_price != null && <span className="font-mono font-bold text-xs text-accent">{formatMoney(b.total_price, currency)}</span>}
              <span className="text-[10px] text-brand/50">{b.assignee?.full_name ?? "Unassigned"}</span>
            </div>
          </div>

          {canManage && (
            <div className="mt-3">
              <select
                value={b.assigned_staff_id ?? ""}
                onChange={(e) => assign(b.id, e.target.value || null)}
                className="w-full rounded-xl bg-canvas border border-transparent py-2 px-3 text-xs outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="">Unassigned</option>
                {staff.map((s: any) => (
                  <option key={s.staff_user_id} value={s.staff_user_id}>{s.staff?.full_name ?? s.invited_email}</option>
                ))}
              </select>
            </div>
          )}

          {(b.status === "pending" || b.status === "accepted" || b.status === "on_the_way") && (
            <div className="mt-3 flex flex-wrap gap-2">
              {b.status === "pending" && canManage && (
                <>
                  <PrimaryButton onClick={() => updateStatus(b.id, "accepted")} className="flex-1 min-w-[110px] py-2 text-xs">Accept</PrimaryButton>
                  <SecondaryButton onClick={() => updateStatus(b.id, "rejected")} className="flex-1 min-w-[110px] py-2 text-xs">Reject</SecondaryButton>
                </>
              )}
              {b.status === "accepted" && (canManage || b.assigned_staff_id === myId) && (
                <PrimaryButton onClick={() => updateStatus(b.id, "completed")} className="w-full rounded-2xl py-2 text-xs">Mark completed</PrimaryButton>
              )}
              {b.status === "on_the_way" && (canManage || b.assigned_staff_id === myId) && (
                <PrimaryButton onClick={() => updateStatus(b.id, "completed")} className="w-full rounded-2xl py-2 text-xs">Mark completed</PrimaryButton>
              )}
            </div>
          )}
        </Tile>
      ))}
    </div>
  );
}

/* ---------- Staff ---------- */
function StaffTab({ providerId, isOwner }: { providerId: string; isOwner: boolean }) {
  const qc = useQueryClient();
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["business-staff-full", providerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_staff")
        .select("id,role,status,invited_email,invite_token,joined_at,staff:profiles!provider_staff_staff_user_id_fkey(full_name,email)")
        .eq("provider_id", providerId)
        .order("invited_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"dispatcher" | "technician">("technician");
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("invite_staff_member", { _email: email, _role: role });
      if (error) throw error;
      setInviteLink(`${window.location.origin}/join-team/${data}`);
      setEmail("");
      qc.invalidateQueries({ queryKey: ["business-staff-full", providerId] });
    } catch (err: any) {
      toast.error(err.message ?? "Could not send invite");
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  };

  const setStatus = async (id: string, status: "active" | "removed") => {
    const { error } = await supabase.rpc("manage_staff_member", { _staff_id: id, _role: null, _status: status });
    if (error) return toast.error(error.message);
    toast.success(status === "removed" ? "Access revoked" : "Reactivated");
    qc.invalidateQueries({ queryKey: ["business-staff-full", providerId] });
  };

  const setRoleFor = async (id: string, newRole: string) => {
    const { error } = await supabase.rpc("manage_staff_member", { _staff_id: id, _role: newRole, _status: null });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["business-staff-full", providerId] });
  };

  if (isLoading) return <InlineSpinner />;

  return (
    <div className="space-y-4">
      {isOwner && (
        <Panel className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Eyebrow>Team</Eyebrow>
              <h2 className="mt-1 text-lg font-black tracking-tight">Invite staff</h2>
            </div>
            <PrimaryButton onClick={() => { setInviting(true); setInviteLink(null); }} className="py-2.5 px-4 text-xs">
              <Plus className="size-4" /> Invite
            </PrimaryButton>
          </div>
        </Panel>
      )}

      <Dialog open={inviting} onOpenChange={(open) => { setInviting(open); if (!open) setInviteLink(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a staff member</DialogTitle>
            <DialogDescription>They'll join your business once they open the link and sign in.</DialogDescription>
          </DialogHeader>
          {inviteLink ? (
            <div className="space-y-3">
              <p className="text-sm text-brand/70">Share this link with them:</p>
              <div className="flex items-center gap-2 rounded-xl bg-canvas p-3">
                <span className="text-xs font-mono truncate flex-1">{inviteLink}</span>
                <button type="button" onClick={() => copyLink(inviteLink)} className="shrink-0 rounded-lg bg-brand/5 p-2 hover:bg-brand/10">
                  <Copy className="size-3.5" />
                </button>
              </div>
              <SecondaryButton type="button" onClick={() => setInviting(false)} className="w-full">Done</SecondaryButton>
            </div>
          ) : (
            <form onSubmit={sendInvite} className="space-y-4">
              <TextField type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full rounded-xl bg-canvas border border-transparent py-2.5 px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="technician">Technician — sees only their assigned jobs</option>
                <option value="dispatcher">Dispatcher — assigns jobs, manages invoices</option>
              </select>
              <DialogFooter>
                <SecondaryButton type="button" onClick={() => setInviting(false)}>Cancel</SecondaryButton>
                <PrimaryButton type="submit" disabled={saving} loading={saving}>Create invite</PrimaryButton>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {staff.length === 0 && <EmptyState icon={Users} title="No staff yet" description="Invite your first team member to get started." />}
      {staff.map((s: any) => (
        <Tile key={s.id} className="hover:shadow-sm">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{s.staff?.full_name ?? s.invited_email}</div>
              <div className="text-xs text-brand/60 truncate">{s.staff?.email ?? s.invited_email}</div>
              {s.status === "invited" && s.invite_token && (
                <button
                  onClick={() => copyLink(`${window.location.origin}/join-team/${s.invite_token}`)}
                  className="mt-1 text-[10px] font-bold uppercase text-accent flex items-center gap-1"
                >
                  <Copy className="size-3" /> Copy invite link
                </button>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <StatusBadge status={s.status} />
              <span className="text-[10px] font-bold uppercase text-brand/40">{s.role}</span>
            </div>
          </div>
          {isOwner && (
            <div className="mt-3 flex gap-1.5 flex-wrap">
              {s.role !== "dispatcher" ? (
                <button onClick={() => setRoleFor(s.id, "dispatcher")} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-canvas border border-brand/10 hover:border-brand/20">
                  Make dispatcher
                </button>
              ) : (
                <button onClick={() => setRoleFor(s.id, "technician")} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-canvas border border-brand/10 hover:border-brand/20">
                  Make technician
                </button>
              )}
              {s.status === "removed" ? (
                <button onClick={() => setStatus(s.id, "active")} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-green-100 text-green-700 hover:bg-green-200">
                  Reactivate
                </button>
              ) : s.status === "active" && (
                <button onClick={() => setStatus(s.id, "removed")} className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-red-100 text-red-700 hover:bg-red-200">
                  Revoke access
                </button>
              )}
            </div>
          )}
        </Tile>
      ))}
    </div>
  );
}

/* ---------- Clients ---------- */
function ClientsTab({ providerId, myId }: { providerId: string; myId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["business-client-bookings", providerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("customer_id,total_price,created_at,customer:profiles!bookings_customer_id_profiles_fkey(full_name,email,phone)")
        .eq("provider_id", providerId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["business-client-notes", providerId, expanded],
    enabled: !!expanded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_client_notes")
        .select("id,note,created_at,author:profiles!provider_client_notes_created_by_fkey(full_name)")
        .eq("provider_id", providerId)
        .eq("customer_id", expanded!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  type ClientSummary = { customerId: string; customer: any; jobs: number; spent: number; lastBooked: string };
  const clientMap = new Map<string, ClientSummary>();
  for (const b of bookings as any[]) {
    const existing = clientMap.get(b.customer_id);
    clientMap.set(b.customer_id, {
      customerId: b.customer_id,
      customer: b.customer,
      jobs: (existing?.jobs ?? 0) + 1,
      spent: (existing?.spent ?? 0) + (Number(b.total_price) || 0),
      lastBooked: existing?.lastBooked && existing.lastBooked > b.created_at ? existing.lastBooked : b.created_at,
    });
  }
  const clients: ClientSummary[] = [...clientMap.values()];

  const addNote = async (customerId: string) => {
    if (!noteText.trim()) return;
    const { error } = await supabase.from("provider_client_notes").insert({ provider_id: providerId, customer_id: customerId, note: noteText.trim(), created_by: myId });
    if (error) return toast.error(error.message);
    setNoteText("");
    qc.invalidateQueries({ queryKey: ["business-client-notes", providerId, customerId] });
  };

  if (isLoading) return <InlineSpinner />;
  if (clients.length === 0) return <EmptyState icon={Briefcase} title="No clients yet" />;

  return (
    <div className="space-y-3">
      {clients.map((c) => (
        <Tile key={c.customerId} className="hover:shadow-sm">
          <button className="w-full text-left" onClick={() => setExpanded(expanded === c.customerId ? null : c.customerId)}>
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{c.customer?.full_name ?? "Customer"}</div>
                <div className="text-xs text-brand/60 truncate">{c.customer?.email}{c.customer?.phone ? ` · ${c.customer.phone}` : ""}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-brand/60">{c.jobs} job{c.jobs === 1 ? "" : "s"}</div>
                <div className="text-[10px] text-brand/40">Last {formatRelativeTime(c.lastBooked)}</div>
              </div>
            </div>
          </button>

          {expanded === c.customerId && (
            <div className="mt-3 border-t border-brand/5 pt-3 space-y-2">
              {notes.length === 0 && <p className="text-xs text-brand/40">No notes yet.</p>}
              {notes.map((n: any) => (
                <div key={n.id} className="text-xs bg-canvas rounded-lg p-2.5">
                  <p className="text-brand/80">{n.note}</p>
                  <p className="text-[10px] text-brand/40 mt-1">{n.author?.full_name ?? "Team"} · {formatRelativeTime(n.created_at)}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <TextField placeholder="Add a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} className="flex-1" />
                <SecondaryButton type="button" onClick={() => addNote(c.customerId)} className="px-4">Add</SecondaryButton>
              </div>
            </div>
          )}
        </Tile>
      ))}
    </div>
  );
}

/* ---------- Invoices ---------- */
type LineItem = { description: string; quantity: number; unit_price: number };

function InvoicesTab({ providerId, canManage }: { providerId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const currency = useCurrency();
  const [creating, setCreating] = useState(false);
  const [bookingId, setBookingId] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [taxPercent, setTaxPercent] = useState("0");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["business-invoices", providerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id,total,status,created_at,paid_at,booking:bookings(id,scheduled_at,customer:profiles!bookings_customer_id_profiles_fkey(full_name))")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: completedBookings = [] } = useQuery({
    queryKey: ["business-completed-bookings", providerId],
    enabled: creating,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,scheduled_at,total_price,customer:profiles!bookings_customer_id_profiles_fkey(full_name)")
        .eq("provider_id", providerId)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0) * (1 + (Number(taxPercent) || 0) / 100);

  const updateItem = (i: number, patch: Partial<LineItem>) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const pickBooking = (id: string) => {
    setBookingId(id);
    const b = completedBookings.find((x: any) => x.id === id);
    if (b?.total_price) setItems([{ description: "Service", quantity: 1, unit_price: Number(b.total_price) }]);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!bookingId) return toast.error("Pick a completed job");
    setSaving(true);
    try {
      const { error } = await supabase.rpc("upsert_invoice", {
        _id: null,
        _booking_id: bookingId,
        _line_items: items.filter((i) => i.description.trim()) as any,
        _tax_percent: Number(taxPercent) || 0,
        _notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success("Invoice created");
      setCreating(false);
      setBookingId("");
      setItems([{ description: "", quantity: 1, unit_price: 0 }]);
      setTaxPercent("0");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["business-invoices", providerId] });
    } catch (err: any) {
      toast.error(err.message ?? "Could not create invoice");
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (id: string) => {
    const { error } = await supabase.rpc("mark_invoice_paid", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Invoice marked paid");
    qc.invalidateQueries({ queryKey: ["business-invoices", providerId] });
  };

  if (isLoading) return <InlineSpinner />;

  return (
    <div className="space-y-4">
      {canManage && (
        <Panel className="p-5 flex items-center justify-between gap-3">
          <div>
            <Eyebrow>Billing</Eyebrow>
            <h2 className="mt-1 text-lg font-black tracking-tight">Invoices</h2>
          </div>
          <PrimaryButton onClick={() => setCreating(true)} className="py-2.5 px-4 text-xs">
            <Plus className="size-4" /> Generate invoice
          </PrimaryButton>
        </Panel>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate invoice</DialogTitle>
            <DialogDescription>Pick a completed job, then adjust the line items.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <select
              required
              value={bookingId}
              onChange={(e) => pickBooking(e.target.value)}
              className="w-full rounded-xl bg-canvas border border-transparent py-2.5 px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="">Select a completed job…</option>
              {completedBookings.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.customer?.full_name ?? "Customer"} — {new Date(b.scheduled_at).toLocaleDateString()}
                </option>
              ))}
            </select>

            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-xl bg-canvas/60 p-2 sm:flex-row sm:items-center sm:bg-transparent sm:p-0">
                  <TextField placeholder="Description" value={item.description} onChange={(e) => updateItem(i, { description: e.target.value })} className="min-w-0 flex-1" />
                  <div className="flex items-center gap-2">
                    <TextField type="number" min={0} step="1" value={String(item.quantity)} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 0 })} className="w-16" />
                    <TextField type="number" min={0} step="0.01" value={String(item.unit_price)} onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) || 0 })} className="w-24" />
                    <button type="button" onClick={() => removeItem(i)} className="shrink-0 text-brand/40 hover:text-red-600"><Trash2 className="size-4" /></button>
                  </div>
                </div>
              ))}
              <SecondaryButton type="button" onClick={addItem} className="w-full py-2 text-xs"><Plus className="size-3.5" /> Add line item</SecondaryButton>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <Eyebrow className="mb-1.5">Tax %</Eyebrow>
                <TextField type="number" min={0} step="0.1" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
              </label>
              <div className="flex flex-col items-end justify-end">
                <Eyebrow>Total</Eyebrow>
                <span className="font-mono font-black text-lg text-accent">{currencySymbol(currency)}{total.toFixed(2)}</span>
              </div>
            </div>

            <TextAreaField placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

            <DialogFooter>
              <SecondaryButton type="button" onClick={() => setCreating(false)}>Cancel</SecondaryButton>
              <PrimaryButton type="submit" disabled={saving} loading={saving}>Create invoice</PrimaryButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {invoices.length === 0 && <EmptyState icon={Receipt} title="No invoices yet" />}
      {invoices.map((inv: any) => (
        <Tile key={inv.id} className="hover:shadow-sm">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{inv.booking?.customer?.full_name ?? "Customer"}</div>
              <div className="text-xs text-brand/60">{inv.booking?.scheduled_at ? new Date(inv.booking.scheduled_at).toLocaleDateString() : ""}</div>
              <div className="text-[10px] text-brand/40 mt-0.5">Created {formatRelativeTime(inv.created_at)}</div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <StatusBadge status={inv.status} />
              <span className="font-mono font-bold text-sm text-accent">{formatMoney(inv.total, currency)}</span>
            </div>
          </div>
          {canManage && inv.status !== "paid" && inv.status !== "void" && (
            <div className="mt-3">
              <button onClick={() => markPaid(inv.id)} className="w-full py-2.5 rounded-xl bg-green-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition hover:bg-green-500">
                <Check className="size-3.5" /> Mark paid
              </button>
            </div>
          )}
        </Tile>
      ))}
    </div>
  );
}
