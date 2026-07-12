import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { geocodeLocation } from "@/lib/geocode.functions";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Loader2, MapPin, ArrowRight, CheckCircle2, Upload, FileCheck2, Clock, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/become-provider")({
  head: () => ({ meta: [{ title: "Become a provider — Nearby" }, { name: "robots", content: "noindex" }] }),
  component: BecomeProviderPage,
});

function BecomeProviderPage() {
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isProvider = roles.includes("provider");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const geocode = useServerFn(geocodeLocation);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("service_categories").select("id,name,icon").order("sort_order");
      return data ?? [];
    },
  });

  const { data: existingRequest, isLoading: reqLoading } = useQuery({
    queryKey: ["my-provider-request", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [uploadingId, setUploadingId] = useState<"service" | "national" | null>(null);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [form, setForm] = useState({
    business_name: "",
    bio: "",
    phone: "",
    hourly_rate: "",
    service_radius_km: 25,
    address: "",
    city: "",
    zip: "",
    availability_note: "",
    latitude: null as number | null,
    longitude: null as number | null,
    service_id_url: "" as string,
    national_id_url: "" as string,
  });

  if (isProvider) {
    return (
      <div className="min-h-screen bg-canvas grid place-items-center px-6 pb-24">
        <div className="text-center max-w-sm">
          <CheckCircle2 className="size-12 text-accent mx-auto" />
          <h1 className="text-xl font-black mt-3">You're already a provider</h1>
          <p className="text-sm text-brand/60 mt-2">Manage your listing and orders from the dashboard.</p>
          <Link to="/dashboard" className="inline-block mt-4 px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-bold">
            Open dashboard
          </Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (reqLoading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin size-6 text-brand/40" /></div>;
  }

  if (existingRequest && existingRequest.status === "pending") {
    return (
      <div className="min-h-screen bg-canvas grid place-items-center px-6 pb-24">
        <div className="text-center max-w-sm">
          <Clock className="size-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-black mt-3">Request under review</h1>
          <p className="text-sm text-brand/60 mt-2">
            Thanks for applying! An admin is reviewing your details and ID documents. You'll be notified once approved.
          </p>
          <div className="mt-4 text-left bg-surface p-3 rounded-xl border border-brand/5 text-xs">
            <div><b>Business:</b> {existingRequest.business_name}</div>
            <div><b>Submitted:</b> {new Date(existingRequest.created_at).toLocaleString()}</div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (existingRequest && existingRequest.status === "rejected") {
    return (
      <div className="min-h-screen bg-canvas grid place-items-center px-6 pb-24">
        <div className="text-center max-w-sm">
          <XCircle className="size-12 text-red-500 mx-auto" />
          <h1 className="text-xl font-black mt-3">Request rejected</h1>
          {existingRequest.review_notes && (
            <p className="text-sm text-brand/60 mt-2">"{existingRequest.review_notes}"</p>
          )}
          <button
            onClick={async () => {
              await supabase.from("provider_requests").delete().eq("id", existingRequest.id);
              qc.invalidateQueries({ queryKey: ["my-provider-request", user?.id] });
            }}
            className="inline-block mt-4 px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-bold"
          >
            Submit new request
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  const geocodeAddress = async () => {
    const q = [form.address, form.city, form.zip].filter(Boolean).join(", ");
    if (!q) return toast.error("Enter address, city, or ZIP first");
    setGeocoding(true);
    try {
      const res = await geocode({ data: { query: q } });
      if (!res.found) toast.error("Location not found");
      else {
        setForm((f) => ({ ...f, latitude: res.lat, longitude: res.lng }));
        toast.success(`Located: ${res.formatted}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setGeocoding(false);
    }
  };

  const uploadFile = async (file: File, kind: "service" | "national") => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Max file size is 5 MB");
    setUploadingId(kind);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("provider-docs").upload(path, file, { upsert: true });
      if (error) throw error;
      setForm((f) => ({
        ...f,
        [kind === "service" ? "service_id_url" : "national_id_url"]: path,
      }));
      toast.success(`${kind === "service" ? "Service ID" : "National ID"} uploaded`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingId(null);
    }
  };

  const submit = async () => {
    if (!form.business_name) return toast.error("Business name is required");
    if (selectedCats.length === 0) return toast.error("Pick at least one category");
    if (!form.service_id_url) return toast.error("Upload your Service ID card");
    if (!form.national_id_url) return toast.error("Upload your National ID");
    setSaving(true);
    try {
      const { error } = await supabase.from("provider_requests").insert({
        user_id: user!.id,
        business_name: form.business_name,
        bio: form.bio || null,
        phone: form.phone || null,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        service_radius_km: form.service_radius_km,
        address: form.address || null,
        city: form.city || null,
        zip: form.zip || null,
        availability_note: form.availability_note || null,
        latitude: form.latitude,
        longitude: form.longitude,
        category_ids: selectedCats,
        service_id_url: form.service_id_url,
        national_id_url: form.national_id_url,
      });
      if (error) throw error;
      toast.success("Request submitted! An admin will review it shortly.");
      qc.invalidateQueries({ queryKey: ["my-provider-request", user!.id] });
      navigate({ to: "/profile" });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas pb-32">
      <header className="bg-surface border-b border-brand/5 px-4 pt-6 pb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-accent">Step {step} of 4</div>
        <h1 className="text-xl font-black mt-1">Provider application</h1>
        <p className="text-xs text-brand/60 mt-1">Admin approval required before your listing goes live.</p>
        <div className="flex gap-1 mt-3">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`h-1 flex-1 rounded ${n <= step ? "bg-accent" : "bg-brand/10"}`} />
          ))}
        </div>
      </header>

      <div className="px-4 py-4 space-y-3">
        {step === 1 && (
          <section className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm space-y-3">
            <h2 className="font-bold">About your business</h2>
            <Field label="Business name" required value={form.business_name} onChange={(v) => setForm({ ...form, business_name: v })} />
            <Field label="Short bio" textarea value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} placeholder="What makes you great at what you do?" />
            <Field label="Contact phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hourly rate ($)" type="number" value={form.hourly_rate} onChange={(v) => setForm({ ...form, hourly_rate: v })} />
              <Field label="Availability" value={form.availability_note} onChange={(v) => setForm({ ...form, availability_note: v })} placeholder="e.g. Weekdays" />
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm space-y-3">
            <h2 className="font-bold">Services you offer</h2>
            <p className="text-xs text-brand/60">Pick everything that applies. Customers browse by these.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {categories.map((c: any) => {
                const on = selectedCats.includes(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setSelectedCats(on ? selectedCats.filter((x) => x !== c.id) : [...selectedCats, c.id])}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold ${on ? "bg-brand text-white" : "bg-canvas border border-brand/10"}`}
                  >
                    {c.icon} {c.name}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm space-y-3">
            <h2 className="font-bold">Service area</h2>
            <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
              <Field label="ZIP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
            </div>
            <Field label="Travel radius (km)" type="number" value={String(form.service_radius_km)} onChange={(v) => setForm({ ...form, service_radius_km: Number(v) || 0 })} />
            <button type="button" onClick={geocodeAddress} disabled={geocoding} className="w-full py-2.5 border border-brand/10 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-60">
              {geocoding ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
              {form.latitude ? `Pinned (${form.latitude.toFixed(3)}, ${form.longitude!.toFixed(3)})` : "Pin location"}
            </button>
          </section>
        )}

        {step === 4 && (
          <section className="bg-surface p-4 rounded-2xl border border-brand/5 shadow-sm space-y-3">
            <h2 className="font-bold">Verification documents</h2>
            <p className="text-xs text-brand/60">Upload clear photos or scans. Only admins can view them (max 5 MB each).</p>
            <UploadField
              label="Service ID card"
              required
              filled={!!form.service_id_url}
              loading={uploadingId === "service"}
              onFile={(f) => uploadFile(f, "service")}
            />
            <UploadField
              label="National ID"
              required
              filled={!!form.national_id_url}
              loading={uploadingId === "national"}
              onFile={(f) => uploadFile(f, "national")}
            />
          </section>
        )}

        <div className="flex gap-2 pt-2">
          {step > 1 && (
            <button onClick={() => setStep(step - 1)} className="flex-1 py-3 rounded-xl border border-brand/10 text-sm font-bold">
              Back
            </button>
          )}
          {step < 4 ? (
            <button
              onClick={() => {
                if (step === 1 && !form.business_name) return toast.error("Business name is required");
                if (step === 2 && selectedCats.length === 0) return toast.error("Pick at least one category");
                setStep(step + 1);
              }}
              className="flex-1 py-3 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 flex items-center justify-center gap-2"
            >
              Continue <ArrowRight className="size-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={saving} className="flex-1 py-3 bg-accent text-white rounded-xl text-sm font-bold shadow-lg shadow-accent/20 disabled:opacity-60 flex items-center justify-center gap-2">
              {saving && <Loader2 className="size-4 animate-spin" />}
              Submit for review
            </button>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", required, textarea, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; textarea?: boolean; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase text-brand/40">{label}{required && " *"}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} required={required} className="mt-1 w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none resize-none" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} className="mt-1 w-full bg-canvas rounded-xl py-2.5 px-3 text-sm outline-none" />
      )}
    </label>
  );
}

function UploadField({
  label, required, filled, loading, onFile,
}: {
  label: string; required?: boolean; filled: boolean; loading: boolean; onFile: (f: File) => void;
}) {
  return (
    <label className={`block cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition ${filled ? "border-accent/40 bg-accent/5" : "border-brand/10 hover:border-brand/20"}`}>
      <input
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {loading ? (
        <Loader2 className="size-6 animate-spin mx-auto text-brand/40" />
      ) : filled ? (
        <FileCheck2 className="size-6 mx-auto text-accent" />
      ) : (
        <Upload className="size-6 mx-auto text-brand/40" />
      )}
      <div className="text-xs font-bold uppercase tracking-wider mt-2">{label}{required && " *"}</div>
      <div className="text-[10px] text-brand/50 mt-0.5">
        {filled ? "Uploaded — tap to replace" : "Tap to select image or PDF"}
      </div>
    </label>
  );
}
