import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPaystackBanks, resolvePayoutAccount, savePayoutAccount } from "@/lib/withdrawals.functions";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Loader2, Landmark, Wallet, CheckCircle2, CircleAlert, ArrowUpRight } from "lucide-react";
import { AppTopBar } from "@/components/AppTopBar";
import { formatMoney, useCurrency } from "@/lib/currency";
import { formatRelativeTime } from "@/lib/time";
import {
  Panel,
  StatusBadge,
  FormField,
  PrimaryButton,
  SecondaryButton,
  EmptyState,
  InlineSpinner,
} from "@/components/ui-kit";

export const Route = createFileRoute("/_authenticated/payouts")({
  head: () => ({ meta: [{ title: "Payouts — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: PayoutsPage,
});

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber;
  return `${"•".repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`;
}

function PayoutsPage() {
  const { user } = useSession();
  const { data: roles = [] } = useRoles(user);
  const isProvider = roles.includes("provider");
  const qc = useQueryClient();
  const currency = useCurrency();

  const listBanks = useServerFn(listPaystackBanks);
  const resolveAccount = useServerFn(resolvePayoutAccount);
  const saveAccount = useServerFn(savePayoutAccount);

  const { data: balance = 0 } = useQuery({
    queryKey: ["provider-balance", user?.id],
    enabled: !!user && isProvider,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("provider_available_balance", { _provider_id: user!.id });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const { data: payoutAccount, isLoading: accountLoading } = useQuery({
    queryKey: ["payout-account", user?.id],
    enabled: !!user && isProvider,
    queryFn: async () => {
      const { data, error } = await supabase.from("provider_payout_accounts").select("*").eq("provider_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["withdrawal-history", user?.id],
    enabled: !!user && isProvider,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select("*")
        .eq("provider_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [editingAccount, setEditingAccount] = useState(false);
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    if (!isProvider || (!editingAccount && payoutAccount)) return;
    setBanksLoading(true);
    listBanks()
      .then((list) => setBanks(list))
      .catch((err: any) => toast.error(err.message ?? "Could not load banks"))
      .finally(() => setBanksLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProvider, editingAccount, payoutAccount]);

  const verifyAccount = async () => {
    if (!bankCode || !accountNumber) return toast.error("Choose a bank and enter an account number");
    setResolving(true);
    setResolvedName(null);
    try {
      const res = await resolveAccount({ data: { accountNumber, bankCode } });
      setResolvedName(res.accountName);
    } catch (err: any) {
      toast.error(err.message ?? "Could not verify account details");
    } finally {
      setResolving(false);
    }
  };

  const submitAccount = async () => {
    if (!resolvedName) return toast.error("Verify the account first");
    const bankName = banks.find((b) => b.code === bankCode)?.name ?? "";
    setSavingAccount(true);
    try {
      await saveAccount({ data: { accountNumber, bankCode, bankName } });
      toast.success("Payout account saved");
      setEditingAccount(false);
      setBankCode("");
      setAccountNumber("");
      setResolvedName(null);
      qc.invalidateQueries({ queryKey: ["payout-account", user!.id] });
    } catch (err: any) {
      toast.error(err.message ?? "Could not save payout account");
    } finally {
      setSavingAccount(false);
    }
  };

  const [amount, setAmount] = useState("");
  const [requesting, setRequesting] = useState(false);

  const requestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return toast.error("Enter a valid amount");
    setRequesting(true);
    try {
      const { error } = await supabase.rpc("request_withdrawal", { _amount: value });
      if (error) throw error;
      toast.success("Withdrawal requested");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["provider-balance", user!.id] });
      qc.invalidateQueries({ queryKey: ["withdrawal-history", user!.id] });
    } catch (err: any) {
      toast.error(err.message ?? "Could not request withdrawal");
    } finally {
      setRequesting(false);
    }
  };

  if (!isProvider) {
    return (
      <div className="min-h-screen bg-canvas grid place-items-center px-6 pb-24">
        <Panel className="max-w-sm p-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-orange-50 text-accent dark:bg-orange-500/10">
            <Wallet className="size-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold tracking-tight">Payouts are for providers</h1>
          <p className="text-sm text-brand/60 mt-2">List your services on Fixrly to earn and withdraw.</p>
          <Link
            to="/become-provider"
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:brightness-105"
          >
            Become a Provider
          </Link>
        </Panel>
        <BottomNav />
      </div>
    );
  }

  const showAccountForm = editingAccount || !payoutAccount;

  return (
    <div className="min-h-screen bg-canvas pb-32 text-brand lg:pb-12">
      <AppTopBar />

      <div className="mx-auto max-w-[1240px] lg:px-6 lg:pt-6">
        <header className="relative overflow-hidden bg-[#0b1730] px-4 pt-[max(env(safe-area-inset-top),1.25rem)] pb-6 text-white lg:rounded-2xl lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-accent/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Payouts</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Withdraw your earnings</h1>
              <p className="mt-1 max-w-md text-sm text-white/70">Manage your payout bank account and request withdrawals from your available balance.</p>
            </div>
            <div className="flex w-full gap-3 sm:w-auto">
              <div className="flex-1 rounded-xl bg-gradient-to-br from-[#ff5a1f] to-[#ff8a3d] px-5 py-3.5 shadow-lg shadow-accent/30 sm:flex-none">
                <div className="text-xs font-medium text-white/85">Available balance</div>
                <div className="mt-0.5 text-2xl font-extrabold tracking-tight">{formatMoney(balance, currency)}</div>
              </div>
              <div className="flex-1 rounded-xl bg-white/10 px-5 py-3.5 ring-1 ring-white/15 sm:flex-none">
                <div className="text-xs font-medium text-white/70">Payout account</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-base font-bold">
                  {payoutAccount ? <CheckCircle2 className="size-4 text-green-400" /> : <CircleAlert className="size-4 text-amber-300" />}
                  {payoutAccount ? "Connected" : "Not set up"}
                </div>
              </div>
            </div>
          </div>
        </header>

      <main className="grid grid-cols-1 items-start gap-4 px-4 pt-4 lg:grid-cols-2 lg:gap-5 lg:px-0 lg:pt-5">
        <Panel>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-bold">Payout bank account</h2>
            {payoutAccount && !editingAccount && (
              <SecondaryButton type="button" onClick={() => setEditingAccount(true)} className="py-2 px-4 text-xs">
                Change bank details
              </SecondaryButton>
            )}
          </div>

          {accountLoading ? (
            <InlineSpinner />
          ) : !showAccountForm && payoutAccount ? (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-soft bg-canvas p-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10">
                <Landmark className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-brand truncate">{payoutAccount.bank_name}</div>
                <div className="text-xs text-brand/60">{maskAccountNumber(payoutAccount.account_number)} · {payoutAccount.account_name}</div>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Bank</span>
                <select
                  value={bankCode}
                  onChange={(e) => { setBankCode(e.target.value); setResolvedName(null); }}
                  disabled={banksLoading}
                  className="w-full bg-canvas rounded-xl border border-soft py-2.5 px-3.5 text-sm outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10"
                >
                  <option value="">{banksLoading ? "Loading banks…" : "Select a bank"}</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
              </label>
              <FormField
                label="Account number"
                value={accountNumber}
                onChange={(v) => { setAccountNumber(v); setResolvedName(null); }}
                placeholder="0123456789"
              />
              <SecondaryButton type="button" onClick={verifyAccount} disabled={resolving} className="w-full">
                {resolving ? <Loader2 className="size-4 animate-spin" /> : "Verify account"}
              </SecondaryButton>
              {resolvedName && (
                <div className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-500/15 dark:text-green-300">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Account name: <span className="font-bold">{resolvedName}</span>
                </div>
              )}
              <div className="flex gap-2">
                {payoutAccount && (
                  <SecondaryButton type="button" onClick={() => setEditingAccount(false)} className="flex-1">
                    Cancel
                  </SecondaryButton>
                )}
                <PrimaryButton type="button" onClick={submitAccount} disabled={!resolvedName || savingAccount} loading={savingAccount} className="flex-1">
                  Save bank details
                </PrimaryButton>
              </div>
            </div>
          )}
        </Panel>

        <Panel as="form" onSubmit={requestWithdrawal}>
          <h2 className="text-base font-bold">Request a withdrawal</h2>
          {!payoutAccount ? (
            <p className="mt-4 text-sm text-brand/60">Add your payout bank account above before requesting a withdrawal.</p>
          ) : balance <= 0 ? (
            <p className="mt-4 text-sm text-brand/60">No balance available yet — completed, paid bookings become withdrawable here.</p>
          ) : (
            <div className="mt-5 space-y-4">
              <FormField
                label={`Amount (max ${formatMoney(balance, currency)})`}
                value={amount}
                onChange={setAmount}
                type="number"
                placeholder="0"
              />
              <PrimaryButton disabled={requesting} loading={requesting} className="w-full">
                Request withdrawal
              </PrimaryButton>
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-2">
          <h2 className="text-base font-bold">Withdrawal history</h2>
          {history.length === 0 ? (
            <EmptyState icon={Landmark} title="No withdrawals yet" description="Your withdrawal requests will show up here." className="mt-4" />
          ) : (
            <ul className="mt-3 divide-y divide-[var(--soft-border)]">
              {history.map((w: any) => (
                <li key={w.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 text-accent dark:bg-orange-500/10">
                      <ArrowUpRight className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{formatMoney(w.amount, w.currency)}</div>
                      <div className="text-xs text-brand/50">{formatRelativeTime(w.created_at)}</div>
                    </div>
                    <StatusBadge status={w.status} />
                  </div>
                  {(w.status === "rejected" || w.status === "failed") && w.admin_notes && (
                    <div className="ml-[3.25rem] mt-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-500/15 dark:text-red-300">Note: {w.admin_notes}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </main>
      </div>

      <BottomNav />
    </div>
  );
}
