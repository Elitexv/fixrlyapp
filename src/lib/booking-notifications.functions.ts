import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendLovableEmail, EmailAPIError } from "@lovable.dev/email-js";

type Input = { bookingId: string };

export const notifyProviderOfBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => d)
  .handler(async ({ data, context }) => {
    const from = process.env.EMAIL_FROM;
    if (!from) {
      console.warn("[booking-notify] EMAIL_FROM not set; skipping email send");
      return { sent: false, reason: "email_not_configured" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "id,scheduled_at,duration_hours,address,notes,total_price,provider_id,customer_id,category:service_categories(name,icon)"
      )
      .eq("id", data.bookingId)
      .maybeSingle();
    if (error || !booking) throw new Error(error?.message ?? "Booking not found");
    if (booking.customer_id !== context.userId) throw new Error("Forbidden");

    const { data: providerUser } = await supabaseAdmin.auth.admin.getUserById(booking.provider_id);
    const providerEmail = providerUser?.user?.email;
    if (!providerEmail) return { sent: false, reason: "provider_no_email" as const };

    const { data: customer } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", booking.customer_id)
      .maybeSingle();

    const when = new Date(booking.scheduled_at).toLocaleString();
    const category = (booking as any).category?.name ?? "Service";
    const total = booking.total_price ? `$${Number(booking.total_price).toFixed(2)}` : "—";
    const customerName = customer?.full_name ?? "A customer";

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;color:#111">
        <h2 style="margin:0 0 8px">New booking request</h2>
        <p style="color:#555;margin:0 0 16px">${customerName} just booked you on Nearby.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#666">Service</td><td style="padding:6px 0"><b>${category}</b></td></tr>
          <tr><td style="padding:6px 0;color:#666">When</td><td style="padding:6px 0"><b>${when}</b></td></tr>
          <tr><td style="padding:6px 0;color:#666">Duration</td><td style="padding:6px 0"><b>${booking.duration_hours}h</b></td></tr>
          <tr><td style="padding:6px 0;color:#666">Address</td><td style="padding:6px 0"><b>${booking.address ?? "—"}</b></td></tr>
          <tr><td style="padding:6px 0;color:#666">Total</td><td style="padding:6px 0"><b>${total}</b></td></tr>
          ${booking.notes ? `<tr><td style="padding:6px 0;color:#666" valign="top">Notes</td><td style="padding:6px 0">${booking.notes}</td></tr>` : ""}
        </table>
        <p style="margin:24px 0 0"><a href="https://fixrlyapp.lovable.app/bookings" style="background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Open dashboard</a></p>
      </div>`;

    const text = `New booking request from ${customerName}\n\nService: ${category}\nWhen: ${when}\nDuration: ${booking.duration_hours}h\nAddress: ${booking.address ?? "—"}\nTotal: ${total}\n${booking.notes ? `Notes: ${booking.notes}\n` : ""}\nOpen dashboard: https://fixrlyapp.lovable.app/bookings`;

    try {
      const result = await sendLovableEmail(
        {
          to: providerEmail,
          from,
          subject: `New booking from ${customerName}`,
          html,
          text,
        },
        {
          apiKey: process.env.LOVABLE_API_KEY!,
          idempotencyKey: `booking-notify-${booking.id}`,
        },
      );
      return { sent: true as const, result };
    } catch (err) {
      if (err instanceof EmailAPIError) {
        console.error("[booking-notify] email error", err.code, err.status);
        return { sent: false as const, reason: err.code };
      }
      throw err;
    }
  });
