import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { StickyHeader, Eyebrow } from "@/components/ui-kit";

const SITE_URL = "https://fixrly.app";
const LAST_UPDATED = "August 31, 2026";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Fixrly" },
      { name: "description", content: "How Fixrly collects, uses, and protects your information." },
      { property: "og:url", content: `${SITE_URL}/privacy` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/privacy` }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-canvas pb-16">
      <StickyHeader>
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="Back"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/5 transition hover:bg-brand/10"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <Eyebrow>Legal</Eyebrow>
            <h1 className="truncate text-base font-black tracking-tight">Privacy Policy</h1>
          </div>
        </div>
      </StickyHeader>

      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand/40">Last updated {LAST_UPDATED}</p>

        <div className="prose-legal mt-6 space-y-8 text-sm leading-relaxed text-brand/80">
          <section>
            <p>
              Fixrly ("Fixrly", "we", "us", or "our") operates a marketplace that connects customers with
              independent local service providers. This Privacy Policy explains what information we collect,
              how we use it, and the choices you have. By using Fixrly, you agree to the collection and use of
              information as described here.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">1. Information we collect</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong className="text-brand">Account information:</strong> name, email address, phone number,
                and profile photo, collected when you sign up or sign in (including via Google).
              </li>
              <li>
                <strong className="text-brand">Provider information:</strong> business details, service
                categories, rates, coverage area, and payout account details, if you list services as a
                provider.
              </li>
              <li>
                <strong className="text-brand">Booking information:</strong> service requests, messages between
                customers and providers, scheduling details, and payment/payout records.
              </li>
              <li>
                <strong className="text-brand">Location information:</strong> an address or coordinates you
                provide, or your device's precise location if you grant permission, used to show nearby
                providers and enable live job tracking.
              </li>
              <li>
                <strong className="text-brand">Device and usage information:</strong> push-notification tokens,
                approximate device/browser data, and basic usage analytics needed to keep the service reliable
                and secure.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">2. How we use your information</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>To create and secure your account, and verify you're not a bot (via reCAPTCHA).</li>
              <li>To connect customers and providers, process bookings, and enable in-app messaging.</li>
              <li>To process payments and provider payouts through our payment processor, Paystack.</li>
              <li>To send booking updates, receipts, and optional push notifications.</li>
              <li>To show relevant nearby providers based on your location.</li>
              <li>To maintain trust and safety, prevent fraud, and enforce our Terms and Conditions.</li>
              <li>To improve and troubleshoot the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">3. How we share information</h2>
            <p className="mt-3">
              We share the minimum information necessary to make a booking work: a customer and provider matched
              on a booking can see each other's name, contact details relevant to the job, and messages sent
              through the app. We also share information with service providers who help us run Fixrly,
              including:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li><strong className="text-brand">Supabase</strong> — database and backend infrastructure.</li>
              <li><strong className="text-brand">Firebase (Google)</strong> — authentication and app security (App Check/reCAPTCHA).</li>
              <li><strong className="text-brand">Paystack</strong> — payment processing and payouts.</li>
              <li><strong className="text-brand">Google Maps</strong> — location search and mapping.</li>
              <li><strong className="text-brand">Vercel</strong> — application hosting.</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information. We may disclose information if required by law, or to
              protect the rights, safety, and property of Fixrly, our users, or the public.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">4. Data retention</h2>
            <p className="mt-3">
              We retain account and booking information for as long as your account is active and as needed to
              comply with legal, tax, and accounting obligations. You may request deletion of your account at
              any time; some records (such as completed transactions) may be retained where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">5. Your choices and rights</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>You can review and update your profile information at any time from your account settings.</li>
              <li>You can disable location access and push notifications in your device or browser settings.</li>
              <li>You can request access to, correction of, or deletion of your personal data by contacting us.</li>
              <li>You can close your account at any time; this stops future data collection tied to it.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">6. Security</h2>
            <p className="mt-3">
              We use industry-standard safeguards — including encrypted connections, access controls (row-level
              security on our database), and reCAPTCHA-based bot protection — to protect your information. No
              method of transmission or storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">7. Children's privacy</h2>
            <p className="mt-3">
              Fixrly is not directed to children under 18, and we do not knowingly collect information from
              children.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">8. Changes to this policy</h2>
            <p className="mt-3">
              We may update this Privacy Policy from time to time. We'll update the "Last updated" date above
              when we do, and material changes will be communicated in-app.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">9. Contact us</h2>
            <p className="mt-3">
              Questions about this policy or your data? Reach us at{" "}
              <a href="mailto:support@fixrly.app" className="font-semibold text-accent underline underline-offset-2">
                support@fixrly.app
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
