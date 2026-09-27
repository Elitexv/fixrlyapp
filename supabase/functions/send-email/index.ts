import { createClient } from "npm:@supabase/supabase-js@2";

// Parallel to send-push: a Postgres trigger (trigger_email_on_new_notification,
// see the add_email_notifications migration) fires this for a subset of
// notification types whenever a row lands in public.notifications, so a
// booking update / new message / account change also reaches the user's
// inbox, not just the in-app bell and a browser push.

const webhookSecret = Deno.env.get("EMAIL_WEBHOOK_SECRET")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
const emailFrom = Deno.env.get("EMAIL_FROM")!; // e.g. "Fixrly <notifications@fixrly.app>" — must be a Resend-verified domain
const SITE_URL = "https://fixrly.app";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Payload = {
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
};

// Where the email's CTA button should send the reader, based on what kind
// of notification this is — best-effort, falls back to the homepage.
function ctaPathFor(type: string): string {
  if (type.startsWith("booking_status_")) return "/bookings";
  if (type === "booking_created" || type === "provider_approved" || type === "provider_rejected") return "/dashboard";
  if (type === "new_message") return "/messages";
  if (type.startsWith("withdrawal_")) return "/payouts";
  return "/";
}

function renderEmail(title: string, body: string, ctaUrl: string) {
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;color:#0f172a">
      <div style="font-size:20px;font-weight:900;color:#ff5a1f;margin-bottom:20px">Fixrly</div>
      <h1 style="font-size:18px;margin:0 0 10px">${title}</h1>
      <p style="font-size:14px;line-height:1.5;color:#475569;margin:0 0 24px">${body}</p>
      <a href="${ctaUrl}" style="display:inline-block;background:#ff5a1f;color:#ffffff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:14px">Open Fixrly</a>
    </div>`;
  const text = `${title}\n\n${body}\n\nOpen Fixrly: ${ctaUrl}`;
  return { html, text };
}

Deno.serve(async (req) => {
  if (req.headers.get("X-Webhook-Secret") !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload: Payload = await req.json();

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", payload.user_id)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!profile?.email) {
    return new Response(JSON.stringify({ sent: false, reason: "no_email" }), { status: 200 });
  }

  const ctaUrl = `${SITE_URL}${ctaPathFor(payload.type)}`;
  const { html, text } = renderEmail(payload.title, payload.body ?? "", ctaUrl);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: profile.email,
      subject: payload.title,
      html,
      text,
    }),
  });

  const result = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[send-email] Resend error", res.status, result);
    return new Response(JSON.stringify({ sent: false, reason: "resend_error", status: res.status, result }), { status: 200 });
  }

  return new Response(JSON.stringify({ sent: true, result }), { status: 200 });
});
