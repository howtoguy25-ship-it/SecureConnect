import { useEffect, useState } from "react";
import { AU_STATES, DEFAULT_AU_STATE } from "@/utils/auStates";
import {
  subscribeRevCheckProviderStatus,
  startRevCheckCheckout,
  runRevCheck,
  type RevCheckResult,
} from "@/services/revCheck";
import "./ReportAlertPanel.css";
import "./RevCheckPanel.css";

// Persists across the round trip to Stripe's own hosted Checkout page and back -- the tab
// genuinely navigates away, so React state alone can't survive it. Cleared once a check has
// actually run (success or error) so a plain page refresh afterward doesn't re-trigger it.
const PENDING_KEY = "trackline.revCheckPending";

interface PendingCheck {
  vin: string;
  plate: string;
  state: string;
}

interface Props {
  // Set by App.tsx when the page loads with a ?revcheck_session=<id> query param (the return
  // trip from Stripe) -- null on a normal open via the FAB button.
  returnSessionId: string | null;
  onClose: () => void;
}

export function RevCheckPanel({ returnSessionId, onClose }: Props) {
  const [providerConnected, setProviderConnected] = useState(false);
  const [vin, setVin] = useState("");
  const [plate, setPlate] = useState("");
  const [state, setState] = useState(DEFAULT_AU_STATE);
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<RevCheckResult | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => subscribeRevCheckProviderStatus(setProviderConnected), []);

  // Runs once, on the return trip from Stripe -- picks the pending VIN back up from
  // sessionStorage and finishes the check the payment was for.
  useEffect(() => {
    if (!returnSessionId) return;
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    let pending: PendingCheck | null = null;
    try {
      pending = raw ? (JSON.parse(raw) as PendingCheck) : null;
    } catch {
      pending = null;
    }
    if (!pending?.vin) {
      setStartError("Couldn't find the vehicle this payment was for -- try running the check again.");
      return;
    }
    setVin(pending.vin);
    setPlate(pending.plate);
    setState(pending.state);
    setChecking(true);
    runRevCheck(pending.vin, returnSessionId)
      .then(setResult)
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnSessionId]);

  const onPayAndCheck = async () => {
    const trimmedVin = vin.trim().toUpperCase();
    if (!trimmedVin) return;
    setStartError(null);
    setStarting(true);
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ vin: trimmedVin, plate: plate.trim().toUpperCase(), state })
    );
    const outcome = await startRevCheckCheckout();
    if (!outcome.ok) {
      sessionStorage.removeItem(PENDING_KEY);
      setStartError(outcome.message ?? "Couldn't start payment.");
      setStarting(false);
    }
    // On success this navigates away to Stripe -- nothing left to do here.
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet revcheck-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-title">Vehicle REV Check</div>

        {!result && !checking && (
          <>
            <p className="revcheck-intro">
              Real PPSR (stolen / written-off / money-owing) history, $14.99 AUD per check via
              secure Stripe payment. PPSR searches by VIN, not plate -- the plate and state below
              are just for your own record.
            </p>

            {!providerConnected && (
              <div className="revcheck-not-connected">REV Check isn't connected yet -- try again later.</div>
            )}

            <input
              className="revcheck-input"
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              placeholder="VIN (17-character chassis number)"
              maxLength={17}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <input
              className="revcheck-input"
              type="text"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="Number plate (optional, your record only)"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <div className="revcheck-state-grid">
              {AU_STATES.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  className={`revcheck-state-chip${state === s.code ? " revcheck-state-chip-selected" : ""}`}
                  onClick={() => setState(s.code)}
                >
                  {s.code}
                </button>
              ))}
            </div>

            {startError && <div className="revcheck-error">{startError}</div>}

            <button
              className="revcheck-pay-button"
              onClick={onPayAndCheck}
              disabled={!vin.trim() || !providerConnected || starting}
            >
              {starting ? "Starting payment…" : "Pay $14.99 & run check"}
            </button>
          </>
        )}

        {checking && <div className="revcheck-status">Running your check…</div>}

        {result && (
          <div className="revcheck-result">
            {result.outcome !== "success" ? (
              <div className="revcheck-error">{result.message}</div>
            ) : (
              <>
                <div className="revcheck-result-row">
                  <span className={`revcheck-flag${result.vehicle?.stolen ? " revcheck-flag-bad" : " revcheck-flag-ok"}`}>
                    {result.vehicle?.stolen ? "⚠ Reported stolen" : "✓ Not reported stolen"}
                  </span>
                </div>
                <div className="revcheck-result-row">
                  <span className={`revcheck-flag${result.vehicle?.writtenOff ? " revcheck-flag-bad" : " revcheck-flag-ok"}`}>
                    {result.vehicle?.writtenOff ? "⚠ Written off" : "✓ Not written off"}
                  </span>
                </div>
                <div className="revcheck-result-row">
                  <span className={`revcheck-flag${(result.securedInterestCount ?? 0) > 0 ? " revcheck-flag-bad" : " revcheck-flag-ok"}`}>
                    {(result.securedInterestCount ?? 0) > 0
                      ? `⚠ ${result.securedInterestCount} money owing on this vehicle`
                      : "✓ No money owing registered"}
                  </span>
                </div>
                {result.vehicle && (
                  <div className="revcheck-vehicle-details">
                    {[result.vehicle.year, result.vehicle.make, result.vehicle.model, result.vehicle.colour]
                      .filter(Boolean)
                      .join(" ")}
                    {result.vehicle.registrationPlate ? ` · ${result.vehicle.registrationPlate}` : ""}
                  </div>
                )}
                {result.certificateUrl && (
                  <a className="revcheck-certificate-link" href={result.certificateUrl} target="_blank" rel="noopener">
                    View PPSR certificate
                  </a>
                )}
              </>
            )}
          </div>
        )}

        <button className="close-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
