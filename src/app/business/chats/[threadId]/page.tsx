"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  orderBy,
  query,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { app } from "@/lib/firebase";

type Message = {
  id: string;
  text: string;
  senderId: string;
  senderRole: "business" | "driver";
  createdAt?: Date | null;
};

const formatDateTime = (d?: Date | null) => {
  if (!d) return "—";
  return d.toLocaleString();
};

export default function BusinessChatThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const router = useRouter();

  const db = useMemo(() => getFirestore(), []);
  const auth = useMemo(() => getAuth(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [thread, setThread] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!threadId) return;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Thinking: "Thread doc is the source of truth for participants + job."
        const threadRef = doc(db, "threads", threadId);
        const threadSnap = await getDoc(threadRef);

        if (!threadSnap.exists()) throw new Error("Chat thread not found.");

        const t = threadSnap.data() as any;

        // Thinking: "Business view must only show threads where I'm the businessId."
        if (t.businessId !== user.uid) {
          throw new Error("You do not have access to this chat.");
        }

        setThread({ id: threadSnap.id, ...t });

        // Thinking: "Messages should be realtime so chat feels like chat."
        const msgsRef = collection(db, "threads", threadId, "messages");
        const q = query(msgsRef, orderBy("createdAt", "asc"));

        const unsubMsgs = onSnapshot(
          q,
          (snap) => {
            const list: Message[] = snap.docs.map((d) => {
              const data = d.data() as any;
              return {
                id: d.id,
                text: data.text,
                senderId: data.senderId,
                senderRole: data.senderRole,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
              };
            });
            setMessages(list);
            setLoading(false);
          },
          (err) => {
            console.error(err);
            setError(err.message || "Failed to load messages.");
            setLoading(false);
          }
        );

        // Cleanup messages listener when auth changes/unmounts
        return () => unsubMsgs();
      } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to load chat.");
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, [auth, db, router, threadId]);

  const sendMessage = async () => {
    setError(null);

    const user = auth.currentUser;
    if (!user) {
      setError("You must be logged in.");
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      const msgsRef = collection(db, "threads", threadId, "messages");

      await addDoc(msgsRef, {
        text: trimmed,
        senderId: user.uid,
        senderRole: "business",
        createdAt: serverTimestamp(),
      });

      const threadRef = doc(db, "threads", threadId);
      await updateDoc(threadRef, {
        lastMessageText: trimmed,
        lastMessageAt: serverTimestamp(),
      });

      setText("");
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Chat</h1>
          <p className="text-sm text-gray-600">
            {thread ? `Job: ${thread.jobId} • Driver: ${thread.driverName || thread.driverId}` : ""}
          </p>
        </div>

        <button
          onClick={() => router.push("/business/chats")}
          className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50"
        >
          Back to Chats
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading chat...</p>}
      {error && !loading && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <div className="bg-white border rounded-lg shadow p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-600">No messages yet.</p>
            )}

            {messages.map((m) => {
              const mine = m.senderRole === "business";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 border ${mine ? "bg-blue-50" : "bg-gray-50"}`}>
                    <p className="text-sm text-gray-800">{m.text}</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {m.senderRole.toUpperCase()} • {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 p-3 border rounded-lg"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !text.trim()}
              className="px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
