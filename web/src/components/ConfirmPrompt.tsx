import "./ConfirmPrompt.css";

interface Props {
  message: string;
  yesLabel?: string;
  noLabel?: string;
  onYes: () => void;
  onNo: () => void;
}

export function ConfirmPrompt({ message, yesLabel = "Yes", noLabel = "No", onYes, onNo }: Props) {
  return (
    <div className="confirm-prompt">
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
