import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRoles } from "@/lib/session";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPaystackBanks, resolvePayoutAccount, savePayoutAccount } from "@/lib/withdrawals.functions";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Loader2, Landmark } from "lucide-react";
import { formatMoney, useCurrency } from "@/lib/currency";
import { formatRelativeTime } from "@/lib/time";
import {
  PageHero,
  Panel,
  Tile,
  StatCard,
  StatusBadge,
  Eyebrow,
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
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-black tracking-tight">Payouts are for providers</h1>
          <p className="text-sm text-brand/60 mt-2">Enable provider mode from your profile to earn and withdraw.</p>
          <Link to="/profile" className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500">
            Go to profile
          </Link>
        </div>
        <BottomNav />
      </div>
    );
  }

  const showAccountForm = editingAccount || !payoutAccount;

  return (
    <div className="min-h-screen bg-canvas pb-32">
      <PageHero eyebrow="Payouts" title="Withdraw your earnings" description="Manage your payout bank account and request withdrawals from your available balance." />

      <main className="mx-auto max-w-3xl px-4 -mt-10 space-y-4">
        <Panel>
          <Eyebrow>Available to withdraw</Eyebrow>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard label="Available balance" value={formatMoney(balance, currency)} accent />
            <StatCard label="Payout account" value={payoutAccount ? "Connected" : "Not set up"} />
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Payout bank account</h2>
            {payoutAccount && !editingAccount && (
              <SecondaryButton type="button" onClick={() => setEditingAccount(true)} className="py-2 px-4 text-xs">
                Change bank details
              </SecondaryButton>
            )}
          </div>

          {accountLoading ? (
            <InlineSpinner />
          ) : !showAccountForm && payoutAccount ? (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-canvas p-4">
              <Landmark className="size-8 text-brand/40 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-bold text-brand truncate">{payoutAccount.bank_name}</div>
                <div className="text-xs text-brand/60">{maskAccountNumber(payoutAccount.account_number)} · {payoutAccount.account_name}</div>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <label className="block">
                <Eyebrow className="mb-1.5">Bank</Eyebrow>
                <select
                  value={bankCode}
                  onChange={(e) => { setBankCode(e.target.value); setResolvedName(null); }}
                  disabled={banksLoading}
                  className="w-full bg-canvas rounded-xl border border-transparent py-2.5 px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
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
              <SecondaryButton type="button" onClick={verifyAccount} disabled={resolving} className="w-full uppercase tracking-[0.18em]">
                {resolving ? <Loader2 className="size-4 animate-spin" /> : "Verify account"}
              </SecondaryButton>
              {resolvedName && (
                <div className="rounded-xl bg-green-50 p-3 text-sm text-green-800">
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
          <h2 className="text-lg font-semibold">Request a withdrawal</h2>
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

        <Panel>
          <h2 className="text-lg font-semibold">Withdrawal history</h2>
          {history.length === 0 ? (
            <EmptyState icon={Landmark} title="No withdrawals yet" description="Your withdrawal requests will show up here." />
          ) : (
            <div className="mt-5 space-y-3">
              {history.map((w: any) => (
                <Tile key={w.id} className="hover:shadow-none">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm font-bold text-brand">{formatMoney(w.amount, w.currency)}</div>
                      <div className="mt-1 text-xs text-brand/50">{formatRelativeTime(w.created_at)}</div>
                    </div>
                    <StatusBadge status={w.status} />
                  </div>
                  {(w.status === "rejected" || w.status === "failed") && w.admin_notes && (
                    <div className="mt-3 text-[11px] text-red-700 bg-red-50 rounded-lg p-2.5">Note: {w.admin_notes}</div>
                  )}
                </Tile>
              ))}
            </div>
          )}
        </Panel>
      </main>

      <BottomNav />
    </div>
  );
}
