import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { useSession } from "@/lib/session";
import {
  fetchConversationMessages,
  fetchConversationsForUser,
  fetchUnreadCounts,
  markConversationRead,
  sendChatMessage,
  type ChatConversation,
} from "@/lib/chat";
import { ProviderAvatar } from "@/components/ui-kit";
import { ArrowLeft, Loader2, Send, MessageSquare, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({ meta: [{ title: "Messages — Fixrly" }, { name: "robots", content: "noindex" }] }),
  component: MessagesPage,
});

// Consecutive messages from the same sender within this window render as one
// visual cluster (single tail, timestamp/read-tick only on the last one) —
// the same convention Uber/Bolt/WhatsApp all use to cut down on repeated chrome.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

const PROVIDER_QUICK_REPLIES = ["I'm on my way", "Running a few minutes late", "I've arrived", "All done, thank you!"];
const CUSTOMER_QUICK_REPLIES = ["How much longer?", "I'm ready whenever you are", "Thank you!", "Can you call me?"];

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatDateSeparator(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function formatBubbleTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatListTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const withinWeek = now.getTime() - d.getTime() < 6 * 24 * 60 * 60 * 1000;
  if (withinWeek) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MessagesPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollBottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      return fetchConversationsForUser(user.id);
    },
  });

  const conversationIds = useMemo(() => conversations.map((c: ChatConversation) => c.id), [conversations]);
  const { data: unreadCounts = {} } = useQuery({
    queryKey: ["conversations-unread", user?.id, conversationIds],
    enabled: !!user && conversationIds.length > 0,
    queryFn: () => fetchUnreadCounts(conversationIds, user!.id),
  });

  const selectedConversation = useMemo(() => conversations.find((c: any) => c.id === selectedConversationId) ?? null, [conversations, selectedConversationId]);
  const isProviderSide = !!(selectedConversation && user && selectedConversation.provider_id === user.id);

  useEffect(() => {
    if (!conversations.length) return;
    const stored = typeof window !== "undefined" ? window.sessionStorage.getItem("selectedConversationId") : null;
    const fallback = conversations.find((c: any) => c.id === stored)?.id ?? conversations[0].id;
    if (!selectedConversationId || !conversations.some((c: any) => c.id === selectedConversationId)) {
      setSelectedConversationId(fallback);
    }
  }, [conversations, selectedConversationId]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["chat-messages", selectedConversationId],
    enabled: !!selectedConversationId,
    queryFn: async () => {
      if (!selectedConversationId) return [];
      return fetchConversationMessages(selectedConversationId);
    },
  });

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selectedConversationId]);

  // Mark incoming messages read the moment a conversation with unread
  // messages is open — mirrors how Uber/Bolt clear the badge as soon as the
  // thread is on screen, not on some separate "mark read" action.
  useEffect(() => {
    if (!selectedConversationId || !user) return;
    if (!(unreadCounts[selectedConversationId] > 0)) return;
    markConversationRead(selectedConversationId, user.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["conversations-unread", user.id] });
        qc.invalidateQueries({ queryKey: ["unread-messages-total", user.id] });
      })
      .catch(() => {});
  }, [selectedConversationId, unreadCounts, user, qc]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const channel = supabase
      .channel(`chat:${selectedConversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${selectedConversationId}` }, (payload) => {
        if (payload.eventType === "DELETE") return;
        const incoming = payload.new as any;
        qc.setQueryData(["chat-messages", selectedConversationId], (old: any[] = []) => {
          const withoutOptimisticDupe = old.filter(
            (m) => !(m._optimistic && m.sender_id === incoming.sender_id && m.content === incoming.content),
          );
          const existingIdx = withoutOptimisticDupe.findIndex((m) => m.id === incoming.id);
          if (existingIdx >= 0) {
            const next = [...withoutOptimisticDupe];
            next[existingIdx] = incoming;
            return next;
          }
          return [...withoutOptimisticDupe, incoming];
        });
        qc.invalidateQueries({ queryKey: ["conversations", user?.id] });
        qc.invalidateQueries({ queryKey: ["conversations-unread", user?.id] });
        qc.invalidateQueries({ queryKey: ["unread-messages-total", user?.id] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConversationId, qc, user?.id]);

  const send = async (overrideText?: string) => {
    const content = (overrideText ?? draft).trim();
    if (!user || !selectedConversation || !content) return;
    const senderRole = isProviderSide ? "provider" : "user";
    const tempId = `temp-${Date.now()}`;
    if (!overrideText) setDraft("");
    qc.setQueryData(["chat-messages", selectedConversation.id], (old: any[] = []) => [
      ...old,
      { id: tempId, conversation_id: selectedConversation.id, sender_id: user.id, sender_role: senderRole, content, created_at: new Date().toISOString(), is_read: false, _optimistic: true },
    ]);
    setSending(true);
    try {
      await sendChatMessage(selectedConversation.id, user.id, senderRole, content);
      qc.invalidateQueries({ queryKey: ["conversations", user.id] });
    } catch (err: any) {
      qc.setQueryData(["chat-messages", selectedConversation.id], (old: any[] = []) => old.filter((m) => m.id !== tempId));
      if (!overrideText) setDraft(content);
      toast.error(err.message ?? "Could not send message");
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return <div className="min-h-screen grid place-items-center px-4 text-center text-sm text-brand/60">Please sign in to chat with providers.</div>;
  }

  const quickReplies = isProviderSide ? PROVIDER_QUICK_REPLIES : CUSTOMER_QUICK_REPLIES;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas">
      <header className="shrink-0 border-b border-brand/5 bg-surface px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-brand/40">Messages</div>
            <h1 className="text-xl font-black">Chat</h1>
          </div>
          <Link to="/" className="text-sm font-bold text-accent">Home</Link>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col gap-3 overflow-hidden px-4 py-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:flex-row">
        <aside className={`${mobileShowChat ? "hidden lg:flex" : "flex"} w-full flex-col overflow-y-auto rounded-3xl border border-brand/5 bg-surface p-2 lg:w-80`}>
          <div className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.24em] text-brand/40">Conversations</div>
          {isLoading ? (
            <div className="grid place-items-center py-8"><Loader2 className="size-5 animate-spin text-brand/40" /></div>
          ) : conversations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-brand/10 p-4 text-sm text-brand/60">No conversations yet. Start from a provider profile to begin chatting.</div>
          ) : (
            <div className="space-y-1">
              {conversations.map((c: ChatConversation) => {
                const iAmProvider = c.provider_id === user.id;
                const name = iAmProvider ? (c.customer_name ?? "Customer") : (c.provider_name ?? "Provider");
                const avatarUrl = iAmProvider ? c.customer_avatar_url : null;
                const photoUrl = iAmProvider ? null : c.provider_photo_url;
                const unread = unreadCounts[c.id] ?? 0;
                const active = selectedConversation?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedConversationId(c.id);
                      setMobileShowChat(true);
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition ${active ? "bg-accent/10" : "hover:bg-brand/5"}`}
                  >
                    <ProviderAvatar name={name} avatarUrl={avatarUrl} photoUrl={photoUrl} className="size-12 rounded-full text-base" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className={`truncate text-sm ${unread > 0 ? "font-black text-brand" : "font-semibold text-brand"}`}>{name}</div>
                        <div className={`shrink-0 text-[10px] ${unread > 0 ? "font-bold text-accent" : "text-brand/40"}`}>{formatListTime(c.last_message_at)}</div>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <div className={`truncate text-xs ${unread > 0 ? "font-semibold text-brand/80" : "text-brand/50"}`}>
                          {c.last_message_preview || "Start the conversation"}
                        </div>
                        {unread > 0 && (
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-bold text-white">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className={`${mobileShowChat ? "flex" : "hidden lg:flex"} min-h-0 flex-1 flex-col rounded-3xl border border-brand/5 bg-surface p-3`}>
          {selectedConversation ? (
            <>
              <div className="flex shrink-0 items-center gap-2.5 border-b border-brand/5 pb-3">
                <button onClick={() => setMobileShowChat(false)} className="rounded-xl p-1.5 text-brand/60 hover:bg-brand/5 lg:hidden">
                  <ArrowLeft className="size-5" />
                </button>
                <ProviderAvatar
                  name={isProviderSide ? (selectedConversation.customer_name ?? "Customer") : (selectedConversation.provider_name ?? "Provider")}
                  avatarUrl={isProviderSide ? selectedConversation.customer_avatar_url : null}
                  photoUrl={isProviderSide ? null : selectedConversation.provider_photo_url}
                  className="size-10 rounded-full text-sm"
                />
                <div className="min-w-0">
                  <div className="truncate font-bold leading-tight">
                    {isProviderSide
                      ? (selectedConversation.customer_name ?? "Customer")
                      : (selectedConversation.provider_name ?? "Provider")}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-brand/40">
                    {isProviderSide ? "Customer" : "Provider"}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex-1 min-h-0 space-y-0.5 overflow-y-auto rounded-2xl bg-canvas p-3">
                {messagesLoading && messages.length === 0 ? (
                  <div className="grid place-items-center py-8"><Loader2 className="size-5 animate-spin text-brand/40" /></div>
                ) : messages.length === 0 ? (
                  <div className="grid place-items-center py-8 text-sm text-brand/60">No messages yet. Say hello.</div>
                ) : (
                  messages.map((m: any, i: number) => {
                    const prev = messages[i - 1];
                    const next = messages[i + 1];
                    const sameDayAsPrev = prev && isSameDay(prev.created_at, m.created_at);
                    const showDateSeparator = !prev || !sameDayAsPrev;
                    const isFirstInGroup =
                      !prev || prev.sender_id !== m.sender_id || !sameDayAsPrev ||
                      new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > GROUP_WINDOW_MS;
                    const sameDayAsNext = next && isSameDay(next.created_at, m.created_at);
                    const isLastInGroup =
                      !next || next.sender_id !== m.sender_id || !sameDayAsNext ||
                      new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > GROUP_WINDOW_MS;
                    const own = m.sender_id === user.id;

                    return (
                      <div key={m.id}>
                        {showDateSeparator && (
                          <div className="my-3 flex justify-center">
                            <span className="rounded-full bg-brand/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand/40">
                              {formatDateSeparator(m.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${own ? "justify-end" : "justify-start"} ${isFirstInGroup ? "mt-2.5" : "mt-0.5"}`}>
                          <div
                            className={`max-w-[80%] px-3.5 py-2 text-sm shadow-sm ${
                              own
                                ? `bg-accent text-white rounded-2xl ${isLastInGroup ? "rounded-br-md" : ""}`
                                : `light-surface bg-white border border-brand/10 text-brand rounded-2xl ${isLastInGroup ? "rounded-bl-md" : ""}`
                            } ${m._optimistic ? "opacity-70" : ""}`}
                          >
                            {m.content}
                            {isLastInGroup && (
                              <div className={`mt-1 flex items-center gap-1 text-[10px] ${own ? "justify-end text-white/70" : "text-brand/40"}`}>
                                {formatBubbleTime(m.created_at)}
                                {own && (m.is_read ? <CheckCheck className="size-3" /> : <Check className="size-3" />)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={scrollBottomRef} />
              </div>

              <div className="mt-3 shrink-0 space-y-2">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {quickReplies.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      disabled={sending}
                      className="light-surface flex-none rounded-full border border-brand/10 bg-white px-3 py-1.5 text-xs font-semibold text-brand/70 transition hover:border-accent/30 hover:text-accent disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a message…"
                    className="light-surface flex-1 rounded-full border border-brand/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-accent/30 focus:ring-2 focus:ring-accent/20"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <button
                    onClick={() => send()}
                    disabled={sending || !draft.trim()}
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-white shadow-lg shadow-accent/20 transition hover:bg-orange-500 disabled:opacity-60"
                  >
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="grid place-items-center py-16 text-sm text-brand/60">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-3 size-8 text-brand/20" />
                Select a conversation to start messaging.
              </div>
            </div>
          )}
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
