"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ApiUsageRow = {
  user_id: string;
  user_name: string | null;
  created_at: string;
  tokens_input: number;
  tokens_output: number;
  model: string;
  endpoint: string;
};

type MessageLogRow = {
  id: string;
  user_id: string | null;
  user_key: string | null;
  user_name: string | null;
  created_at: string;
  message: string;
  reason: string;
  blocked: boolean;
  endpoint: string;
};

type UserUsage = {
  user: string;
  displayName: string;
  todayTokens: number;
  weekTokens: number;
};

const dailyLimit = 10_000;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek() {
  const date = startOfToday();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

function tenMinutesAgo() {
  return new Date(Date.now() - 10 * 60 * 1000);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date(value));
}

function shortUser(value: string | null | undefined) {
  if (!value) {
    return "anon";
  }

  return value.includes("@") || value.length <= 14
    ? value
    : `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function shortMessage(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function sumTokens(row: ApiUsageRow) {
  return (row.tokens_input ?? 0) + (row.tokens_output ?? 0);
}

export default function SecurityAdminPage() {
  const [usageRows, setUsageRows] = useState<ApiUsageRow[]>([]);
  const [messageLogs, setMessageLogs] = useState<MessageLogRow[]>([]);
  const [status, setStatus] = useState("Ładuję dane...");

  useEffect(() => {
    let cancelled = false;

    async function loadSecurityData() {
      setStatus("Ładuję dane...");
      const weekStart = startOfWeek().toISOString();

      const [usageResult, logsResult] = await Promise.all([
        supabase
          .from("api_usage")
          .select("user_id, user_name, created_at, tokens_input, tokens_output, model, endpoint")
          .gte("created_at", weekStart)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("message_logs")
          .select("id, user_id, user_key, user_name, created_at, message, reason, blocked, endpoint")
          .gte("created_at", weekStart)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      if (cancelled) {
        return;
      }

      if (usageResult.error || logsResult.error) {
        setStatus(
          usageResult.error?.message ??
            logsResult.error?.message ??
            "Nie udalo sie pobrac danych.",
        );
        return;
      }

      const nextUsageRows = (usageResult.data ?? []) as ApiUsageRow[];
      const nextMessageLogs = (logsResult.data ?? []) as MessageLogRow[];
      setUsageRows(nextUsageRows);
      setMessageLogs(nextMessageLogs);
      setStatus("Dane odświeżone");
    }

    void loadSecurityData();

    return () => {
      cancelled = true;
    };
  }, []);

  const today = useMemo(() => startOfToday(), []);
  const tenMinuteCutoff = useMemo(() => tenMinutesAgo(), []);

  function displayUser(
    userIdOrKey: string | null | undefined,
    userName?: string | null,
  ) {
    if (userName?.trim()) {
      return userName;
    }

    if (!userIdOrKey) {
      return "anon";
    }

    return shortUser(userIdOrKey);
  }

  const topUsers = useMemo(() => {
    const usage = new Map<string, UserUsage>();

    for (const row of usageRows) {
      const user = row.user_id;
      const current = usage.get(user) ?? {
        user,
        displayName: displayUser(user, row.user_name),
        todayTokens: 0,
        weekTokens: 0,
      };
      const tokens = sumTokens(row);

      current.weekTokens += tokens;

      if (new Date(row.created_at) >= today) {
        current.todayTokens += tokens;
      }

      usage.set(user, current);
    }

    return [...usage.values()]
      .sort((a, b) => b.weekTokens - a.weekTokens)
      .slice(0, 5);
  }, [today, usageRows]);

  const blockedLogs = useMemo(
    () => messageLogs.filter((log) => log.blocked).slice(0, 20),
    [messageLogs],
  );

  const alerts = useMemo(() => {
    const nextAlerts: Array<{ level: "high" | "medium"; text: string }> = [];

    for (const user of topUsers) {
      if (user.todayTokens >= dailyLimit * 0.8) {
        nextAlerts.push({
          level: user.todayTokens >= dailyLimit ? "high" : "medium",
          text: `${user.displayName} zużywa ${Math.round(
            (user.todayTokens / dailyLimit) * 100,
          )}% dziennego limitu tokenów.`,
        });
      }
    }

    const recentCounts = new Map<string, number>();

    for (const log of messageLogs) {
      if (new Date(log.created_at) < tenMinuteCutoff) {
        continue;
      }

      const key = log.user_key ?? log.user_id ?? "anon";
      recentCounts.set(key, (recentCounts.get(key) ?? 0) + 1);
    }

    for (const [user, count] of recentCounts) {
      if (count > 20) {
        nextAlerts.push({
          level: "high",
          text: `${displayUser(user)} wysłał ${count} wiadomości w 10 minut.`,
        });
      }
    }

    for (const log of blockedLogs.slice(0, 5)) {
      nextAlerts.push({
        level: "medium",
        text: `Filtr zablokował wiadomość usera ${displayUser(
          log.user_key ?? log.user_id,
          log.user_name,
        )}: ${log.reason}`,
      });
    }

    return nextAlerts;
  }, [blockedLogs, messageLogs, tenMinuteCutoff, topUsers]);

  const stats = useMemo(() => {
    const todayRows = usageRows.filter((row) => new Date(row.created_at) >= today);
    const totalToday = todayRows.reduce((sum, row) => sum + sumTokens(row), 0);
    const totalWeek = usageRows.reduce((sum, row) => sum + sumTokens(row), 0);
    const userCount = new Set(usageRows.map((row) => row.user_id)).size;

    return {
      totalToday,
      totalWeek,
      blockedCount: blockedLogs.length,
      averagePerUser: userCount ? Math.round(totalWeek / userCount) : 0,
    };
  }, [blockedLogs.length, today, usageRows]);

  return (
    <main className="admin-security-shell">
      <header className="admin-security-header">
        <div>
          <p>Admin</p>
          <h1>{"\u{1F6E1}\u{FE0F} Panel bezpieczeństwa"}</h1>
        </div>
        <span>{status}</span>
      </header>

      <section className="security-stats" aria-label="Statystyki">
        <div>
          <span>Tokeny dziś</span>
          <strong>{stats.totalToday.toLocaleString("pl-PL")}</strong>
        </div>
        <div>
          <span>Tokeny tydzień</span>
          <strong>{stats.totalWeek.toLocaleString("pl-PL")}</strong>
        </div>
        <div>
          <span>Zablokowane</span>
          <strong>{stats.blockedCount}</strong>
        </div>
        <div>
          <span>Średnio / user</span>
          <strong>{stats.averagePerUser.toLocaleString("pl-PL")}</strong>
        </div>
      </section>

      <section className="admin-security-grid">
        <article className="security-panel security-panel-wide">
          <h2>Zablokowane wiadomości</h2>
          <div className="security-table-wrap">
            <table className="security-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Wiadomość</th>
                  <th>Powód</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {blockedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4}>Brak zablokowanych wiadomości w tym tygodniu.</td>
                  </tr>
                ) : (
                  blockedLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{displayUser(log.user_key ?? log.user_id, log.user_name)}</td>
                      <td>{shortMessage(log.message)}</td>
                      <td>{log.reason}</td>
                      <td>{formatDate(log.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="security-panel">
          <h2>Top 5 userów po zużyciu</h2>
          <div className="security-user-list">
            {topUsers.length === 0 ? (
              <p>Brak zużycia tokenów w tym tygodniu.</p>
            ) : (
              topUsers.map((user) => {
                const percent = Math.min(100, (user.todayTokens / dailyLimit) * 100);

                return (
                  <div key={user.user}>
                    <span>{user.displayName}</span>
                    <strong>{user.todayTokens.toLocaleString("pl-PL")} dziś</strong>
                    <small>{user.weekTokens.toLocaleString("pl-PL")} w tygodniu</small>
                    <div className="security-meter">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <small>{Math.round(percent)}% limitu</small>
                  </div>
                );
              })
            )}
          </div>
        </article>

        <article className="security-panel">
          <h2>Alerty</h2>
          <div className="security-alert-list">
            {alerts.length === 0 ? (
              <p>Brak aktywnych alertów.</p>
            ) : (
              alerts.map((alert, index) => (
                <div className={alert.level} key={`${alert.text}-${index}`}>
                  {alert.text}
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
