import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Loader2, Check, X, FileText, IdCard } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Nearby" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useSession();
  const { data: roles = [], isLoading: rolesLoading } = useRoles(user);
  const qc = useQueryClient();
  const isAdmin = roles.includes("admin");

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ count: providers }, { count: bookings }, { count: reviews }] = await Promise.all([
        supabase.from("provider_profiles").select("id", { count: "exact", head: true }),
        supabase.from("bookings").select("id", { count: "exact", head: true }),
        supabase.from("reviews").select("id", { count: "exact", head: true }),
      ]);
      return { providers: providers ?? 0, bookings: bookings ?? 0, reviews: reviews ?? 0 };
    },
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["admin-providers"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("provider_profiles").select("id,business_name,city,is_active,created_at").order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const { data: recentBookings = [] } = useQuery({
    queryKey: ["admin-bookings"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("bookings").select("id,status,scheduled_at,total_price,provider:provider_profiles(business_name)").order("created_at", { ascending: false }).limit(20);
      return (data ?? []) as any[];
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["admin-provider-requests"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_requests")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const toggle = async (id: string, is_active: boolean) => {
    const { error } = await supabase.from("provider_profiles").update({ is_active: !is_active }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-providers"] });
  };

  const viewDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from("provider-docs").createSignedUrl(path, 300);
    if (error || !data) return toast.error(error?.message ?? "Cannot open document");
    window.open(data.signedUrl, "_blank");
  };

  const approve = async (id: string) => {
    const { error } = await supabase.rpc("approve_provider_request", { _request_id: id });
    if (error) return toast.error(error.message);
    toast.success("Provider approved");
    qc.invalidateQueries({ queryKey: ["admin-provider-requests"] });
    qc.invalidateQueries({ queryKey: ["admin-providers"] });
  };

  const reject = async (id: string) => {
    const notes = prompt("Reason for rejection (shown to applicant):", "");
    if (notes === null) return;
    const { error } = await supabase.rpc("reject_provider_request", { _request_id: id, _notes: notes });
    if (error) return toast.error(error.message);
    toast.success("Request rejected");
    qc.invalidateQueries({ queryKey: ["admin-provider-requests"] });
  };

  if (rolesLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin size-6 text-brand/40" /></div>;
  if (!isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center px-6 pb-24 text-center">
        <div>
          <h1 className="text-xl font-black">Admins only</h1>
          <p className="text-sm text-brand/60 mt-2">Ask a workspace admin to grant you the admin role.</p>
          <Link to="/" className="inline-block mt-4 px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-bold">Home</Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas pb-24">
      <header className="bg-brand text-white px-4 pt-6 pb-4">
        <h1 className="text-xl font-black">Admin</h1>
        <p className="text-xs text-white/60 mt-1">Marketplace overview & moderation.</p>
      </header>

      <div className="px-4 py-4 grid grid-cols-3 gap-2">
        <SmallStat label="Providers" value={stats?.providers ?? 0} />
        <SmallStat label="Bookings" value={stats?.bookings ?? 0} />
        <SmallStat label="Reviews" value={stats?.reviews ?? 0} />
      </div>

      <section className="px-4 mt-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold">Provider requests</h2>
          <span className="text-[10px] font-bold uppercase text-brand/40">
            {requests.filter((r: any) => r.status === "pending").length} pending
          </span>
        </div>
        <div className="space-y-2">
          {requests.length === 0 && (
            <div className="text-xs text-brand/50 bg-surface p-3 rounded-xl border border-brand/5">No requests yet.</div>
          )}
          {requests.map((r: any) => (
            <div key={r.id} className="bg-surface p-3 rounded-xl border border-brand/5 space-y-2">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{r.business_name}</div>
                  <div className="text-xs text-brand/60 truncate">
                    {[r.city, r.zip].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {r.phone && <div className="text-xs text-brand/60">📞 {r.phone}</div>}
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${
                  r.status === "pending" ? "bg-amber-100 text-amber-700"
                  : r.status === "approved" ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
                }`}>{r.status}</span>
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
      </section>

      <section className="px-4 mt-2">
        <h2 className="font-bold mb-2">Providers</h2>
        <div className="space-y-2">
          {providers.map((p: any) => (
            <div key={p.id} className="bg-surface p-3 rounded-xl border border-brand/5 flex justify-between items-center">
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{p.business_name}</div>
                <div className="text-xs text-brand/60">{p.city ?? "—"}</div>
              </div>
              <button
                onClick={() => toggle(p.id, p.is_active)}
                className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${p.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
              >
                {p.is_active ? "Active" : "Suspended"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 mt-6">
        <h2 className="font-bold mb-2">Recent bookings</h2>
        <div className="space-y-2">
          {recentBookings.map((b: any) => (
            <div key={b.id} className="bg-surface p-3 rounded-xl border border-brand/5 flex justify-between items-center">
              <div className="min-w-0">
                <div className="font-bold text-sm truncate">{b.provider?.business_name}</div>
                <div className="text-xs text-brand/60">{new Date(b.scheduled_at).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase">{b.status}</div>
                {b.total_price && <div className="font-mono text-xs font-bold text-accent">${Number(b.total_price).toFixed(0)}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <BottomNav />
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface p-3 rounded-xl border border-brand/5 text-center">
      <div className="font-mono font-black text-xl">{value}</div>
      <div className="text-[10px] font-bold uppercase text-brand/40">{label}</div>
    </div>
  );
}
