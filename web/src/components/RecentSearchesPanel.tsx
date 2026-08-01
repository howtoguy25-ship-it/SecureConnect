import { useState } from "react";
import type { SearchHistoryEntry } from "@/services/searchHistory";
import "./RecentSearchesPanel.css";

// Default collapsed count -- the dropdown toggle expands to the full stored history (see
// searchHistory.ts's own cap) and collapses back to this.
const COLLAPSED_COUNT = 3;

interface Props {
  history: SearchHistoryEntry[];
  onSelect: (entry: SearchHistoryEntry) => void;
  onRemove: (placeId: string) => void;
  onClearAll: () => void;
}

export function RecentSearchesPanel({ history, onSelect, onRemove, onClearAll }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (history.length === 0) return null;
  const visible = expanded ? history : history.slice(0, COLLAPSED_COUNT);

  return (
    <div className="recent-searches-panel">
      <div className="recent-searches-header">
        <span>Recent searches</span>
        <div className="recent-searches-header-actions">
          <button className="recent-searches-clear-all" onClick={onClearAll}>
            Clear all
          </button>
          {history.length > COLLAPSED_COUNT && (
            <button
              className="recent-searches-dropdown-toggle"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Show fewer recent searches" : "Show all recent searches"}
            >
              {expanded ? "▲" : "▼"}
            </button>
          )}
        </div>
      </div>
      {visible.map((entry) => (
        <div key={entry.placeId} className="recent-search-row">
          <button className="recent-search-row-main" onClick={() => onSelect(entry)}>
            <span className="recent-search-icon">🕐</span>
            <span className="recent-search-text">
              <span className="recent-search-name">{entry.name}</span>
              {entry.address && <span className="recent-search-address">{entry.address}</span>}
            </span>
          </button>
          <button
            className="recent-search-remove"
            onClick={() => onRemove(entry.placeId)}
            aria-label={`Remove ${entry.name} from recent searches`}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
