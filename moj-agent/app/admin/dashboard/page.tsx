"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ApiUsageRow = {
  user_id: string;
  user_name: string | null;
  created_at: string;
  tokens_input: number;
  tokens_output: number;
  endpoint: string;
};

type ConversationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string | null;
  user_id: string;
};

type MessageRow = {
  conversation_id: string | null;
};

type UserProfileRow = {
  id: string;
  name: string | null;
  display_name: string | null;
};

type DailyMetric = {
  date: string;
  label: string;
  tokens: number;
  conversations: number;
};

const tokenPriceUsdPerMillion = 0.15;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfLastSevenDays() {
  const date = startOfToday();
  date.setDate(date.getDate() - 6);
  return date;
}

function dayKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Warsaw",
    year: "numeric",
  }).format(date);
}

function dayLabel(value: Date) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));
}

function sumTokens(row: ApiUsageRow) {
  return (row.tokens_input ?? 0) + (row.tokens_output ?? 0);
}

function formatNumber(value: number) {
  return value.toLocaleString("pl-PL");
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2,
    style: "currency",
  }).format(value);
}

function shortUser(value: string) {
  return value.length <= 14 ? value : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function buildEmptyDailyMetrics(): DailyMetric[] {
  const start = startOfLastSevenDays();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    return {
      date: dayKey(date),
      label: dayLabel(date),
      tokens: 0,
      conversations: 0,
    };
  });
}

function LineChart({ data }: { data: DailyMetric[] }) {
  const maxTokens = Math.max(1, ...data.map((day) => day.tokens));
  const width = 640;
  const height = 220;
  const padding = 24;
  const step = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const points = data.map((day, index) => {
    const x = padding + index * step;
    const y =
      height - padding - (day.tokens / maxTokens) * (height - padding * 2);

    return { ...day, x, y };
  });
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="usage-line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tokeny per dzień">
        <polyline points={path} />
        {points.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="5" />
            <text x={point.x} y={height - 5}>
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function BarChart({ data }: { data: DailyMetric[] }) {
  const maxConversations = Math.max(1, ...data.map((day) => day.conversations));

  return (
    <div className="usage-bar-chart" aria-label="Rozmowy per dzień">
      {data.map((day) => (
        <div key={day.date}>
          <div>
            <span style={{ height: `${(day.conversations / maxConversations) * 100}%` }} />
          </div>
          <strong>{day.conversations}</strong>
          <small>{day.label}</small>
        </div>
      ))}
    </div>
  );
}

function EndpointPie({ data }: { data: Array<{ endpoint: string; tokens: number }> }) {
  const total = data.reduce((sum, item) => sum + item.tokens, 0);
  let cursor = 0;
  const colors = ["#7dd3fc", "#7df7c8", "#f9e27d", "#f0abfc", "#fda4af"];
  const gradient =
    total === 0
      ? "#25253a 0 100%"
      : data
          .map((item, index) => {
            const start = cursor;
            const end = start + (item.tokens / total) * 100;
            cursor = end;
            return `${colors[index % colors.length]} ${start}% ${end}%`;
          })
          .join(", ");

  return (
    <div className="usage-pie-wrap">
      <div
        aria-label="Tokeny per endpoint"
        className="usage-pie"
        role="img"
        style={{ background: `conic-gradient(${gradient})` }}
      />
      <div className="usage-pie-legend">
        {data.length === 0 ? (
          <p>Brak danych o endpointach.</p>
        ) : (
          data.map((item, index) => (
            <div key={item.endpoint}>
              <span style={{ background: colors[index % colors.length] }} />
              <strong>{item.endpoint}</strong>
              <small>{formatNumber(item.tokens)} tokenów</small>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function UsageDashboardPage() {
  const [usageRows, setUsageRows] = useState<ApiUsageRow[]>([]);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [recentConversations, setRecentConversations] = useState<ConversationRow[]>([]);
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({});
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [conversationCount, setConversationCount] = useState(0);
  const [status, setStatus] = useState("Ładuję dane...");

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      setStatus("Ładuję dane...");
      const weekStart = startOfLastSevenDays().toISOString();

      const [usageResult, conversationResult, recentResult] = await Promise.all([
        supabase
          .from("api_usage")
          .select("user_id, user_name, created_at, tokens_input, tokens_output, endpoint")
          .gte("created_at", weekStart)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("conversations")
          .select("id, user_id, title, created_at, updated_at", { count: "exact" })
          .gte("created_at", weekStart)
          .order("created_at", { ascending: false })
          .limit(2000),
        supabase
          .from("conversations")
          .select("id, user_id, title, created_at, updated_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (cancelled) {
        return;
      }

      if (usageResult.error || conversationResult.error || recentResult.error) {
        setStatus(
          usageResult.error?.message ??
            conversationResult.error?.message ??
            recentResult.error?.message ??
            "Nie udało się pobrać danych.",
        );
        return;
      }

      const nextUsageRows = (usageResult.data ?? []) as ApiUsageRow[];
      const nextConversations = (conversationResult.data ?? []) as ConversationRow[];
      const nextRecent = (recentResult.data ?? []) as ConversationRow[];
      const recentIds = nextRecent.map((conversation) => conversation.id);
      const userIds = [...new Set(nextRecent.map((conversation) => conversation.user_id))];

      const [messagesResult, profilesResult] = await Promise.all([
        recentIds.length
          ? supabase
              .from("messages")
              .select("conversation_id")
              .in("conversation_id", recentIds)
              .limit(1000)
          : Promise.resolve({ data: [], error: null }),
        userIds.length
          ? supabase
              .from("user_profiles")
              .select("id, name, display_name")
              .in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (cancelled) {
        return;
      }

      if (messagesResult.error || profilesResult.error) {
        setStatus(
          messagesResult.error?.message ??
            profilesResult.error?.message ??
            "Nie udało się pobrać szczegółów rozmów.",
        );
        return;
      }

      const nextMessageCounts: Record<string, number> = {};

      for (const row of (messagesResult.data ?? []) as MessageRow[]) {
        if (!row.conversation_id) {
          continue;
        }

        nextMessageCounts[row.conversation_id] =
          (nextMessageCounts[row.conversation_id] ?? 0) + 1;
      }

      const nextProfiles: Record<string, string> = {};

      for (const profile of (profilesResult.data ?? []) as UserProfileRow[]) {
        nextProfiles[profile.id] =
          profile.display_name?.trim() || profile.name?.trim() || shortUser(profile.id);
      }

      setUsageRows(nextUsageRows);
      setConversations(nextConversations);
      setRecentConversations(nextRecent);
      setMessageCounts(nextMessageCounts);
      setProfiles(nextProfiles);
      setConversationCount(conversationResult.count ?? nextConversations.length);
      setStatus("Dane odświeżone");
    }

    void loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, []);

  const today = useMemo(() => startOfToday(), []);

  const dailyMetrics = useMemo(() => {
    const metrics = buildEmptyDailyMetrics();
    const byDate = new Map(metrics.map((metric) => [metric.date, metric]));

    for (const row of usageRows) {
      const metric = byDate.get(dayKey(row.created_at));

      if (metric) {
        metric.tokens += sumTokens(row);
      }
    }

    for (const conversation of conversations) {
      const metric = byDate.get(dayKey(conversation.created_at));

      if (metric) {
        metric.conversations += 1;
      }
    }

    return metrics;
  }, [conversations, usageRows]);

  const endpointData = useMemo(() => {
    const byEndpoint = new Map<string, number>();

    for (const row of usageRows) {
      byEndpoint.set(row.endpoint, (byEndpoint.get(row.endpoint) ?? 0) + sumTokens(row));
    }

    return [...byEndpoint.entries()]
      .map(([endpoint, tokens]) => ({ endpoint, tokens }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);
  }, [usageRows]);

  const stats = useMemo(() => {
    const todayUsage = usageRows.filter((row) => new Date(row.created_at) >= today);
    const todayTokens = todayUsage.reduce((sum, row) => sum + sumTokens(row), 0);
    const userIds = new Set(conversations.map((conversation) => conversation.user_id));
    const dailyCost = (todayTokens / 1_000_000) * tokenPriceUsdPerMillion;

    return {
      conversationCount,
      dailyCost,
      todayTokens,
      userCount: userIds.size,
    };
  }, [conversationCount, conversations, today, usageRows]);

  function displayUser(userId: string) {
    return profiles[userId] ?? shortUser(userId);
  }

  return (
    <main className="usage-dashboard-shell">
      <header className="usage-dashboard-header">
        <div>
          <p>Admin</p>
          <h1>{"\u{1F4CA} Dashboard"}</h1>
        </div>
        <span>{status}</span>
      </header>

      <section className="usage-stats" aria-label="Najważniejsze metryki">
        <article>
          <span>Użytkownicy</span>
          <strong>{formatNumber(stats.userCount)}</strong>
          <small>unikalni w ostatnich 7 dniach</small>
        </article>
        <article>
          <span>Rozmowy</span>
          <strong>{formatNumber(stats.conversationCount)}</strong>
          <small>rozmowy w ostatnich 7 dniach</small>
        </article>
        <article>
          <span>Tokeny dziś</span>
          <strong>{formatNumber(stats.todayTokens)}</strong>
          <small>input + output</small>
        </article>
        <article>
          <span>Koszt dziś</span>
          <strong>{formatUsd(stats.dailyCost)}</strong>
          <small>$0.15 / 1M tokenów</small>
        </article>
      </section>

      <section className="usage-dashboard-grid">
        <article className="usage-panel usage-panel-wide">
          <h2>Tokeny per dzień</h2>
          <LineChart data={dailyMetrics} />
        </article>

        <article className="usage-panel">
          <h2>Rozmowy per dzień</h2>
          <BarChart data={dailyMetrics} />
        </article>

        <article className="usage-panel">
          <h2>Tokeny per endpoint</h2>
          <EndpointPie data={endpointData} />
        </article>

        <article className="usage-panel usage-panel-wide">
          <h2>Ostatnie rozmowy</h2>
          <div className="security-table-wrap">
            <table className="security-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Tytuł</th>
                  <th>Data</th>
                  <th>Wiadomości</th>
                </tr>
              </thead>
              <tbody>
                {recentConversations.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Brak rozmów do wyświetlenia.</td>
                  </tr>
                ) : (
                  recentConversations.map((conversation) => (
                    <tr key={conversation.id}>
                      <td>{displayUser(conversation.user_id)}</td>
                      <td>{conversation.title || "Nowa rozmowa"}</td>
                      <td>{formatDate(conversation.created_at)}</td>
                      <td>{messageCounts[conversation.id] ?? 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
