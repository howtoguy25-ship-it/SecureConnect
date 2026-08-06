import { ALERT_LABELS, type AlertType } from "@/types/alert";
import { MAX_ALERT_COMMENT_WORDS, wordCount } from "@/utils/commentFilter";
import "./PlacementBar.css";

interface Props {
  type: AlertType;
  comment: string;
  onCommentChange: (text: string) => void;
  commentBlocked: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  // "Set at my location" -- per explicit request, a one-tap shortcut that places AND
  // immediately confirms the alert at the driver's own real live geolocation, without needing
  // the pin already dragged/tapped there. Only enabled once a real geolocation fix exists.
  onConfirmAtMyLocation: () => void;
  canUseMyLocation: boolean;
}

export function PlacementBar({
  type,
  comment,
  onCommentChange,
  commentBlocked,
  onConfirm,
  onCancel,
  onConfirmAtMyLocation,
  canUseMyLocation,
}: Props) {
  return (
    <div className="placement-bar">
      <div className="placement-text">
        Drag the pin or tap the map to place your <strong>{ALERT_LABELS[type]}</strong> report
      </div>

      {/* Optional "up to 7 words" comment, mirroring the mobile app -- clamped live to the word
          cap on every keystroke so it's never possible to type past it, and blocked language is
          flagged here (disables Confirm) as well as re-checked again inside reportAlert itself
          before the write. */}
      <input
        className={`placement-comment-input${commentBlocked ? " placement-comment-input-error" : ""}`}
        type="text"
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        placeholder="Add a short comment (optional)"
        maxLength={120}
      />
      <div className="placement-comment-footer">
        {commentBlocked ? (
          <span className="placement-comment-error">That wording isn't allowed -- please rephrase.</span>
        ) : (
          <span />
        )}
        <span className="placement-comment-count">
          {wordCount(comment)}/{MAX_ALERT_COMMENT_WORDS} words
        </span>
      </div>

      <div className="placement-buttons">
        <button className="placement-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="placement-my-location"
          onClick={onConfirmAtMyLocation}
          disabled={!canUseMyLocation}
          title="Set alert at my current location"
          aria-label="Set alert at my current location"
        >
          📍
        </button>
        <button className="placement-confirm" onClick={onConfirm} disabled={commentBlocked}>
          Confirm location
        </button>
      </div>
    </div>
  );
}
