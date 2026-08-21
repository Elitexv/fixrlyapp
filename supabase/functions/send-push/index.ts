import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Payload = {
  user_id: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
};

Deno.serve(async (req) => {
  if (req.headers.get("X-Webhook-Secret") !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload: Payload = await req.json();
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", payload.user_id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    data: payload.data ?? {},
  });

  const staleIds: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) staleIds.push(sub.id);
      }
    }),
  );

  if (staleIds.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
  }

  return new Response(JSON.stringify({ sent, removed: staleIds.length }), { status: 200 });
});
