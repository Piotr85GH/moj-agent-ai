"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useImageAttachment } from "../use-image-attachment";

type AIModel = "flash" | "pro";

type UserProfile = {
  id: string;
  name: string | null;
  preferences: Record<string, unknown>;
};

const aiModels: Array<{
  id: AIModel;
  label: string;
  icon: string;
  description: string;
}> = [
  { id: "flash", label: "Flash", icon: "⚡", description: "szybki" },
  { id: "pro", label: "Pro", icon: "🧠", description: "zaawansowany" },
];

const exampleQuestions = [
  "Jestem na B2B. Co powinienem wiedziec o podatkach?",
  "Ryczalt czy skala podatkowa - od czego zaczac porownanie?",
  "Jakie koszty firmowe moge rozliczac jako freelancer IT?",
  "Kiedy warto rejestrowac sie do VAT?",
];

function getMessageText(parts: UIMessage["parts"]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function splitSources(text: string) {
  const lines = text.split("\n");
  const sourceLines = lines.filter((line) =>
    /(?:📎\s*)?(?:Źródło|Źródła|Zrodlo|Zrodla):/i.test(line.trim()),
  );
  const body = lines
    .filter(
      (line) =>
        !/(?:📎\s*)?(?:Źródło|Źródła|Zrodlo|Zrodla):/i.test(line.trim()),
    )
    .join("\n")
    .trim();

  return { body, sourceLines };
}

function MessageText({ parts }: { parts: UIMessage["parts"] }) {
  const { body, sourceLines } = splitSources(getMessageText(parts));

  return (
    <>
      {body}
      {sourceLines.length > 0 && (
        <div className="message-sources">
          {sourceLines.map((line) => (
            <div key={line}>{line.startsWith("📎") ? line : `📎 ${line}`}</div>
          ))}
        </div>
      )}
    </>
  );
}

function createConversationTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "Nowa rozmowa";
  }

  return normalized.length > 50 ? `${normalized.slice(0, 47)}...` : normalized;
}

function createTextMessage(
  id: string,
  role: "user" | "assistant",
  content: string,
): UIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text: content }],
  };
}

function normalizePreferences(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function formatPreferenceValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatPreferencesList(preferences: Record<string, unknown>) {
  return Object.entries(preferences)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `- ${key}: ${formatPreferenceValue(value)}`)
    .join("\n");
}

function createProfileGreeting(userProfile: UserProfile) {
  const preferencesList = formatPreferencesList(userProfile.preferences);

  return userProfile.name
    ? [
        `Cześć, ${userProfile.name}! Miło Cię znowu widzieć.`,
        preferencesList
          ? `Pamiętam Twoje preferencje:\n${preferencesList}`
          : "Nie mam jeszcze zapisanych preferencji.",
        "W czym mogę dzisiaj pomóc?",
      ].join("\n\n")
    : "Cześć! Nie znamy się jeszcze. Jak masz na imię?";
}

function isAutomaticProfileGreeting(message: UIMessage) {
  if (isLocalProfileGreeting(message)) {
    return true;
  }

  if (message.role !== "assistant") {
    return false;
  }

  const text = getMessageText(message.parts);

  return (
    text.startsWith("Czesc, ") ||
    text.startsWith("Cześć, ") ||
    text.startsWith("Czesc! Nie znamy sie jeszcze.") ||
    text.startsWith("Cześć! Nie znamy się jeszcze.")
  );
}

function isLocalProfileGreeting(message: UIMessage) {
  return message.id.startsWith("profile-greeting-");
}

export default function Home() {
  const { messages, sendMessage, setMessages, status, error } = useChat();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<AIModel>("flash");
  const [messageModels, setMessageModels] = useState<Record<string, AIModel>>(
    {},
  );
  const [memoryOpen, setMemoryOpen] = useState(true);
  const [exportStatus, setExportStatus] = useState("");
  const [isLoadingConversation, setIsLoadingConversation] = useState(true);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [memoryStatus, setMemoryStatus] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [didShowProfileGreeting, setDidShowProfileGreeting] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastSentModelRef = useRef<AIModel>("flash");
  const conversationIdRef = useRef<string | null>(null);
  const hasUserMessageRef = useRef(false);
  const savedMessageIdsRef = useRef<Set<string>>(new Set());
  const userProfileRef = useRef<UserProfile | null>(null);
  const imageAttachment = useImageAttachment();

  const isLoading =
    status === "submitted" || status === "streaming" || isLoadingProfile;
  const textHistory = useMemo(
    () =>
      messages.map((message) => ({
        ...message,
        text: getMessageText(message.parts),
      })),
    [messages],
  );
  const characterCount = textHistory.reduce(
    (total, message) => total + message.text.length,
    0,
  );
  const estimatedTokens = Math.ceil(characterCount / 4);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  useEffect(() => {
    let isCancelled = false;

    async function loadUserProfile() {
      setIsLoadingProfile(true);
      setProfileStatus("");

      let userId = window.localStorage.getItem("user_id");

      if (!userId) {
        userId = crypto.randomUUID();
        window.localStorage.setItem("user_id", userId);
      }

      const { data: existingProfile, error: readError } = await supabase
        .from("user_profiles")
        .select("id, name, preferences")
        .eq("id", userId)
        .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (readError) {
        setProfileStatus(`Profil niedostepny: ${readError.message}`);
        setUserProfile({
          id: userId,
          name: null,
          preferences: {},
        });
        setIsLoadingProfile(false);
        return;
      }

      if (existingProfile) {
        setUserProfile({
          id: existingProfile.id,
          name: existingProfile.name,
          preferences: normalizePreferences(existingProfile.preferences),
        });
        setIsLoadingProfile(false);
        return;
      }

      const { data: createdProfile, error: createError } = await supabase
        .from("user_profiles")
        .insert({ id: userId, preferences: {} })
        .select("id, name, preferences")
        .single();

      if (isCancelled) {
        return;
      }

      if (createError) {
        setProfileStatus(`Nie udalo sie utworzyc profilu: ${createError.message}`);
        setUserProfile({
          id: userId,
          name: null,
          preferences: {},
        });
        setIsLoadingProfile(false);
        return;
      }

      setUserProfile({
        id: createdProfile.id,
        name: createdProfile.name,
        preferences: normalizePreferences(createdProfile.preferences),
      });
      setIsLoadingProfile(false);
    }

    loadUserProfile();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadLatestConversation() {
      setIsLoadingConversation(true);
      setMemoryStatus("");
      const selectedConversationId = new URLSearchParams(
        window.location.search,
      ).get("conversation");

      const conversationQuery = supabase.from("conversations").select("id");
      const { data: conversation, error: conversationError } =
        selectedConversationId
          ? await conversationQuery.eq("id", selectedConversationId).maybeSingle()
          : await conversationQuery
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();

      if (isCancelled) {
        return;
      }

      if (conversationError) {
        setMemoryStatus(`Pamiec niedostepna: ${conversationError.message}`);
        setIsLoadingConversation(false);
        return;
      }

      if (!conversation) {
        setConversationId(null);
        conversationIdRef.current = null;
        hasUserMessageRef.current = false;
        savedMessageIdsRef.current = new Set();
        setIsLoadingConversation(false);
        return;
      }

      const { data: storedMessages, error: messagesError } = await supabase
        .from("messages")
        .select("id, role, content")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });

      if (isCancelled) {
        return;
      }

      if (messagesError) {
        setMemoryStatus(`Nie udalo sie wczytac rozmowy: ${messagesError.message}`);
        setIsLoadingConversation(false);
        return;
      }

      const nextMessages = (storedMessages ?? [])
        .filter(
          (message) =>
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string",
        )
        .map((message) =>
          createTextMessage(
            message.id,
            message.role as "user" | "assistant",
            message.content ?? "",
          ),
        );
      const hasUserMessage = nextMessages.some(
        (message) => message.role === "user",
      );
      const visibleMessages =
        !hasUserMessage &&
        nextMessages.length > 0 &&
        nextMessages.every(isAutomaticProfileGreeting)
          ? []
          : nextMessages;

      savedMessageIdsRef.current = new Set(
        visibleMessages.map((message) => message.id),
      );
      hasUserMessageRef.current = visibleMessages.some(
        (message) => message.role === "user",
      );
      setConversationId(conversation.id);
      conversationIdRef.current = conversation.id;
      setMessages(visibleMessages);
      setIsLoadingConversation(false);
    }

    loadLatestConversation();

    return () => {
      isCancelled = true;
    };
  }, [setMessages]);

  useEffect(() => {
    setMessageModels((current) => {
      let changed = false;
      const next = { ...current };

      for (const message of messages) {
        if (message.role === "assistant" && !next[message.id]) {
          next[message.id] = lastSentModelRef.current;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [messages]);

  useEffect(() => {
    if (
      didShowProfileGreeting ||
      isLoadingConversation ||
      isLoadingProfile ||
      messages.length > 0 ||
      !userProfile
    ) {
      return;
    }

    setMessages([
      createTextMessage(
        `profile-greeting-${Date.now()}`,
        "assistant",
        createProfileGreeting(userProfile),
      ),
    ]);
    setDidShowProfileGreeting(true);
  }, [
    didShowProfileGreeting,
    isLoadingConversation,
    isLoadingProfile,
    messages.length,
    setMessages,
    userProfile,
  ]);

  useEffect(() => {
    if (isLoadingConversation) {
      return;
    }

    async function saveNewMessages() {
      let currentConversationId = conversationIdRef.current;

      for (const message of messages) {
        if (savedMessageIdsRef.current.has(message.id)) {
          continue;
        }

        if (isLocalProfileGreeting(message)) {
          savedMessageIdsRef.current.add(message.id);
          continue;
        }

        if (message.role !== "user" && message.role !== "assistant") {
          continue;
        }

        if (message.role === "assistant" && status !== "ready") {
          continue;
        }

        const content = getMessageText(message.parts).trim();

        if (!content) {
          continue;
        }

        if (!currentConversationId) {
          const { data, error: createError } = await supabase
            .from("conversations")
            .insert({ title: createConversationTitle(content) })
            .select("id")
            .single();

          if (createError) {
            setMemoryStatus(`Nie udalo sie utworzyc rozmowy: ${createError.message}`);
            return;
          }

          currentConversationId = data.id;
          conversationIdRef.current = data.id;
          setConversationId(data.id);
        }

        const isFirstUserMessage =
          message.role === "user" && !hasUserMessageRef.current;
        const now = new Date().toISOString();

        const { error: insertError } = await supabase.from("messages").insert({
          conversation_id: currentConversationId,
          role: message.role,
          content,
        });

        if (insertError) {
          setMemoryStatus(`Nie udalo sie zapisac wiadomosci: ${insertError.message}`);
          return;
        }

        savedMessageIdsRef.current.add(message.id);

        const conversationUpdate = isFirstUserMessage
          ? { title: createConversationTitle(content), updated_at: now }
          : { updated_at: now };
        const { error: updateError } = await supabase
          .from("conversations")
          .update(conversationUpdate)
          .eq("id", currentConversationId);

        if (updateError) {
          setMemoryStatus(`Nie udalo sie odswiezyc rozmowy: ${updateError.message}`);
          return;
        }

        if (isFirstUserMessage) {
          hasUserMessageRef.current = true;
        }

        setMemoryStatus("Rozmowa zapisana");
      }
    }

    saveNewMessages();
  }, [conversationId, isLoadingConversation, messages, status]);

  async function createNewConversation() {
    const { data, error: createError } = await supabase
      .from("conversations")
      .insert({ title: "Nowa rozmowa" })
      .select("id")
      .single();

    if (createError) {
      setMemoryStatus(`Nie udalo sie utworzyc rozmowy: ${createError.message}`);
      setConversationId(null);
      conversationIdRef.current = null;
      return null;
    }

    setConversationId(data.id);
    conversationIdRef.current = data.id;
    hasUserMessageRef.current = false;
    savedMessageIdsRef.current = new Set();
    setMemoryStatus("Nowa rozmowa gotowa");

    return data.id;
  }

  async function ensureConversation(title: string) {
    if (conversationIdRef.current) {
      return conversationIdRef.current;
    }

    const { data, error: createError } = await supabase
      .from("conversations")
      .insert({ title: createConversationTitle(title) })
      .select("id")
      .single();

    if (createError) {
      setMemoryStatus(`Pamiec lokalnie bez zapisu: ${createError.message}`);
      return null;
    }

    setConversationId(data.id);
    conversationIdRef.current = data.id;

    return data.id;
  }

  async function refreshUserProfile() {
    const currentProfile = userProfileRef.current;

    if (!currentProfile) {
      return;
    }

    const { data, error: readError } = await supabase
      .from("user_profiles")
      .select("id, name, preferences")
      .eq("id", currentProfile.id)
      .single();

    if (readError) {
      setProfileStatus(`Nie udalo sie odswiezyc profilu: ${readError.message}`);
      return;
    }

    setUserProfile({
      id: data.id,
      name: data.name,
      preferences: normalizePreferences(data.preferences),
    });
  }

  async function sendUserMessage(text: string) {
    if ((!text && !imageAttachment.attachedImage) || isLoading) {
      return;
    }

    lastSentModelRef.current = model;
    await ensureConversation(text || "Rozmowa o obrazie");
    await sendMessage(
      { text: text || "Co widzisz na tym obrazie?" },
      {
        body: {
          image: imageAttachment.attachedImage?.dataUrl,
          model,
          userId: userProfileRef.current?.id,
          userProfile: userProfileRef.current,
        },
      },
    );
    void refreshUserProfile();
    imageAttachment.clearImage();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text && !imageAttachment.attachedImage) {
      return;
    }

    setInput("");
    await sendUserMessage(text);
  }

  async function startNewConversation() {
    setDidShowProfileGreeting(true);
    setMessages([]);
    setMessageModels({});
    setInput("");
    setExportStatus("");
    await createNewConversation();

    const currentProfile = userProfileRef.current;

    if (currentProfile) {
      setMessages([
        createTextMessage(
          `profile-greeting-${Date.now()}`,
          "assistant",
          createProfileGreeting(currentProfile),
        ),
      ]);
    }
  }

  async function exportConversation() {
    const exportText = textHistory
      .map((message) => {
        const author = message.role === "user" ? "User" : "Agent";
        return `${author}: ${message.text}`;
      })
      .join("\n");

    if (!exportText) {
      return;
    }

    await navigator.clipboard.writeText(exportText);
    setExportStatus("Skopiowano!");
    window.setTimeout(() => setExportStatus(""), 1800);
  }

  return (
    <main className="chat-shell">
      <section className="chat-panel" aria-label="Czat AI">
        <header className="chat-header">
          <h1>Marta - doradca podatkowy</h1>
          <p>
            Ekspert od PIT, VAT, ryczaltu i B2B. Zapytaj mnie o rozliczenia,
            koszty firmowe albo wybor formy opodatkowania.
          </p>

          <div className="example-questions" aria-label="Przykladowe pytania">
            {exampleQuestions.map((question) => (
              <button
                disabled={isLoading}
                key={question}
                onClick={() => sendUserMessage(question)}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
        </header>

        <section className="memory-panel" aria-label="Kontekst rozmowy">
          <button
            className="memory-toggle"
            onClick={() => setMemoryOpen((isOpen) => !isOpen)}
            type="button"
          >
            <span>Kontekst rozmowy</span>
            <span>{memoryOpen ? "Ukryj" : "Pokaz"}</span>
          </button>

          {memoryOpen && (
            <div className="memory-content">
              <p>
                Wiadomosci: {messages.length} | ~Tokeny: {estimatedTokens}
                {userProfile?.name ? ` | Uzytkownik: ${userProfile.name}` : ""}
              </p>
              <div className="memory-actions">
                <button onClick={startNewConversation} type="button">
                  🗑 Nowa rozmowa
                </button>
                <button
                  disabled={messages.length === 0}
                  onClick={exportConversation}
                  type="button"
                >
                  📋 Eksportuj rozmowe
                </button>
                {exportStatus && <span>{exportStatus}</span>}
                {memoryStatus && <span>{memoryStatus}</span>}
                {profileStatus && <span>{profileStatus}</span>}
              </div>
            </div>
          )}
        </section>

        <div className="model-switcher" aria-label="Model AI">
          {aiModels.map((item) => (
            <button
              className={model === item.id ? "active" : ""}
              disabled={isLoading}
              key={item.id}
              onClick={() => setModel(item.id)}
              type="button"
            >
              <span>{item.icon}</span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>

        <div className="messages" aria-live="polite">
          {isLoadingConversation ? (
            <div className="empty-state">
              <p>Wczytuje rozmowe z pamieci...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <p>Wybierz model i zadaj pierwsze pytanie podatkowe.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div className={`message-row ${message.role}`} key={message.id}>
                <div className="message-bubble">
                  {message.role === "assistant" && (
                    <span
                      className={`model-badge ${
                        messageModels[message.id] ?? model
                      }`}
                    >
                      {
                        aiModels.find(
                          (item) =>
                            item.id === (messageModels[message.id] ?? model),
                        )?.icon
                      }{" "}
                      {messageModels[message.id] ?? model}
                    </span>
                  )}
                  <MessageText parts={message.parts} />
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="message-row assistant">
              <div className="message-bubble loading">Mysle...</div>
            </div>
          )}

          {error && (
            <div className="message-row assistant">
              <div className="message-bubble">
                Wystapil problem z odpowiedzia AI. Sprobuj ponownie.
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {imageAttachment.attachedImage && (
          <div className="attachment-preview">
            <img alt="Zalaczony obraz" src={imageAttachment.attachedImage.dataUrl} />
            <div>
              <strong>📎 Screenshot - zadaj pytanie o ten obraz</strong>
              <span>{imageAttachment.attachedImage.name}</span>
            </div>
            <button onClick={imageAttachment.clearImage} type="button">
              X
            </button>
          </div>
        )}

        {imageAttachment.imageError && (
          <div className="attachment-error">{imageAttachment.imageError}</div>
        )}

        <form className="composer" onSubmit={handleSubmit}>
          <input
            accept="image/*"
            hidden
            onChange={imageAttachment.handleFileChange}
            ref={imageAttachment.fileInputRef}
            type="file"
          />
          <button
            className="icon-button"
            disabled={isLoading}
            onClick={imageAttachment.openFilePicker}
            type="button"
            title="Dodaj obraz"
          >
            📎
          </button>
          <input
            aria-label="Wiadomosc"
            disabled={isLoading}
            onChange={(event) => setInput(event.target.value)}
            onPaste={imageAttachment.handlePaste}
            placeholder="Napisz wiadomosc..."
            value={input}
          />
          <button
            disabled={
              isLoading ||
              (input.trim().length === 0 && !imageAttachment.attachedImage)
            }
            type="submit"
          >
            Wyslij
          </button>
        </form>
      </section>
    </main>
  );
}
