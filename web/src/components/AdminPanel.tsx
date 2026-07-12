import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/services/firebase";
import "./AdminPanel.css";

interface UserRow {
  id: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  provider: string | null;
  firstSignInAt: string;
  lastSignInAt: string;
}

function formatTimestamp(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toLocaleString();
  }
  return "—";
}

interface Props {
  onClose: () => void;
}

export function AdminPanel({ onClose }: Props) {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Firestore rules restrict this list() to the admin email -- a non-admin gets a
    // permission-denied error here, not silently empty data.
    getDocs(query(collection(db, "users"), orderBy("lastSignInAt", "desc")))
      .then((snap) => {
        setRows(
          snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                displayName: data.displayName ?? null,
                email: data.email ?? null,
                phoneNumber: data.phoneNumber ?? null,
                provider: data.provider ?? null,
                firstSignInAt: formatTimestamp(data.firstSignInAt),
                lastSignInAt: formatTimestamp(data.lastSignInAt),
              };
            })
            // Only rows with a real sign-in identity are meaningful here.
            .filter((row) => row.email || row.phoneNumber)
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load sign-in history."));
  }, []);

  return (
    <div className="admin-panel-backdrop" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-panel-header">
          <span>Sign-in history</span>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="admin-panel-subtitle">
          Names, emails, and phone numbers only — Firebase never exposes passwords to this
          app or any server code, so there's nothing to show even if we wanted to.
        </div>

        {error && <div className="admin-panel-error">{error}</div>}
        {!error && !rows && <div className="admin-panel-loading">Loading…</div>}
        {!error && rows && rows.length === 0 && (
          <div className="admin-panel-loading">No real (non-guest) sign-ins yet.</div>
        )}

        {rows && rows.length > 0 && (
          <table className="admin-panel-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email / Phone</th>
                <th>Provider</th>
                <th>First sign-in</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.displayName ?? "—"}</td>
                  <td>{row.email ?? row.phoneNumber ?? "—"}</td>
                  <td>{row.provider?.replace(".com", "")}</td>
                  <td>{row.firstSignInAt}</td>
                  <td>{row.lastSignInAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
