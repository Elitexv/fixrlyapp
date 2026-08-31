import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { StickyHeader, Eyebrow } from "@/components/ui-kit";

const SITE_URL = "https://fixrly.app";
const LAST_UPDATED = "August 31, 2026";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms and Conditions — Fixrly" },
      { name: "description", content: "The terms that govern your use of Fixrly." },
      { property: "og:url", content: `${SITE_URL}/terms` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/terms` }],
  }),
  component: TermsPage,
});

function TermsPage() {
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
            <h1 className="truncate text-base font-black tracking-tight">Terms and Conditions</h1>
          </div>
        </div>
      </StickyHeader>

      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand/40">Last updated {LAST_UPDATED}</p>

        <div className="prose-legal mt-6 space-y-8 text-sm leading-relaxed text-brand/80">
          <section>
            <p>
              These Terms and Conditions ("Terms") govern your access to and use of Fixrly (the "Service"). By
              creating an account or using Fixrly, you agree to these Terms. If you don't agree, please don't use
              the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">1. What Fixrly is</h2>
            <p className="mt-3">
              Fixrly is a marketplace that connects customers who need local services with independent service
              providers who offer them. Fixrly is not the employer of any provider, and providers are not
              employees, agents, or partners of Fixrly. Fixrly does not itself perform the services listed on the
              platform.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">2. Accounts</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>You must provide accurate information and keep your account credentials secure.</li>
              <li>You must be at least 18 years old to create an account.</li>
              <li>You're responsible for all activity that happens under your account.</li>
              <li>We may suspend or terminate accounts that violate these Terms or misuse the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">3. Bookings</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>A booking is an agreement made directly between a customer and a provider through Fixrly.</li>
              <li>Providers set their own rates, availability, and service area.</li>
              <li>Either party may cancel a booking; repeated cancellations may affect account standing.</li>
              <li>Fixrly is not responsible for the quality, safety, or legality of services performed, or for any dispute between a customer and a provider.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">4. Payments and payouts</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Payments for bookings are processed through our payment processor, Paystack.</li>
              <li>Fixrly may retain a service fee from each transaction before paying out providers.</li>
              <li>Providers are responsible for their own taxes on income earned through Fixrly.</li>
              <li>Payouts are sent to the bank/payout details a provider has verified on their account.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">5. Provider responsibilities</h2>
            <p className="mt-3">
              If you list services as a provider, you confirm that you hold any license, permit, insurance, or
              qualification required by law to perform those services in your area, and that the information on
              your listing is accurate. You are solely responsible for the services you perform.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">6. Acceptable use</h2>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Use the Service for any unlawful, fraudulent, or harmful purpose.</li>
              <li>Circumvent the platform to avoid fees, such as arranging payment outside the app for a booking made on it.</li>
              <li>Post false, misleading, or abusive content, reviews, or messages.</li>
              <li>Attempt to interfere with, disrupt, or gain unauthorized access to the Service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">7. Reviews and content</h2>
            <p className="mt-3">
              Any reviews, messages, or other content you submit must be honest and your own. You grant Fixrly a
              license to display this content within the Service. We may remove content that violates these
              Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">8. Disclaimers</h2>
            <p className="mt-3">
              The Service is provided "as is" without warranties of any kind. Fixrly does not guarantee that the
              Service will be uninterrupted, error-free, or that any provider will meet your expectations. To the
              fullest extent permitted by law, Fixrly disclaims all warranties, express or implied.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">9. Limitation of liability</h2>
            <p className="mt-3">
              To the fullest extent permitted by law, Fixrly and its team are not liable for any indirect,
              incidental, or consequential damages arising from your use of the Service, or from any service
              performed by a provider. Fixrly's total liability for any claim is limited to the fees Fixrly
              received in connection with the booking giving rise to the claim.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">10. Termination</h2>
            <p className="mt-3">
              You may stop using Fixrly and close your account at any time. We may suspend or terminate your
              access if you violate these Terms, engage in fraud, or create risk or legal exposure for Fixrly or
              other users.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">11. Changes to these Terms</h2>
            <p className="mt-3">
              We may update these Terms from time to time. We'll update the "Last updated" date above, and
              continued use of the Service after changes take effect means you accept the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-brand">12. Contact us</h2>
            <p className="mt-3">
              Questions about these Terms? Reach us at{" "}
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
