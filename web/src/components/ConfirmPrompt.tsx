import "./ConfirmPrompt.css";

interface Props {
  message: string;
  yesLabel?: string;
  noLabel?: string;
  onYes: () => void;
  onNo: () => void;
  // "modal" (default) is the centered dialog used for the night-mode/leaving-zone prompts.
  // "top" is a compact strip pinned to the top of the screen instead -- used where the
  // prompt shouldn't block the view underneath it (see the 3D-view prompt in App.tsx).
  variant?: "modal" | "top";
}

export function ConfirmPrompt({
  message,
  yesLabel = "Yes",
  noLabel = "No",
  onYes,
  onNo,
  variant = "modal",
}: Props) {
  return (
    <div className={variant === "top" ? "confirm-prompt-top" : "confirm-prompt"}>
      <div className="confirm-prompt-message">{message}</div>
      <div className="confirm-prompt-buttons">
        <button className="confirm-prompt-no" onClick={onNo}>
          {noLabel}
        </button>
        <button className="confirm-prompt-yes" onClick={onYes}>
          {yesLabel}
        </button>
      </div>
    </div>
  );
}
