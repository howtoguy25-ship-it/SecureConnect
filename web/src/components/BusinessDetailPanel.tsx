import "./BusinessDetailPanel.css";

interface Props {
  place: google.maps.places.PlaceResult;
  onGetDirections: () => void;
  onClose: () => void;
}

export function BusinessDetailPanel({ place, onGetDirections, onClose }: Props) {
  const isOpenNow = place.opening_hours?.open_now;
  const reviews = place.reviews?.slice(0, 5) ?? [];

  return (
    <div className="business-panel">
      <button className="business-panel-close-x" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <div className="business-panel-name">{place.name}</div>
      {place.formatted_address && <div className="business-panel-address">{place.formatted_address}</div>}

      {place.rating !== undefined && (
        <div className="business-panel-rating">
          ⭐ {place.rating.toFixed(1)}
          {place.user_ratings_total !== undefined && ` (${place.user_ratings_total} reviews)`}
        </div>
      )}

      {place.opening_hours && (
        <div className="business-panel-hours">
          <span className={isOpenNow ? "business-panel-open" : "business-panel-closed"}>
            {isOpenNow === undefined ? "Hours unknown" : isOpenNow ? "Open now" : "Closed now"}
          </span>
          {place.opening_hours.weekday_text && (
            <ul>
              {place.opening_hours.weekday_text.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {place.formatted_phone_number && (
        <div className="business-panel-meta">📞 {place.formatted_phone_number}</div>
      )}
      {place.website && (
        <a className="business-panel-meta business-panel-link" href={place.website} target="_blank" rel="noreferrer">
          🔗 Website
        </a>
      )}

      {reviews.length > 0 && (
        <div className="business-panel-reviews">
          <div className="business-panel-reviews-title">Reviews</div>
          {reviews.map((review, i) => (
            <div className="business-panel-review" key={i}>
              <div className="business-panel-review-header">
                <strong>{review.author_name}</strong>
                <span>{"⭐".repeat(Math.round(review.rating ?? 0))}</span>
              </div>
              <div className="business-panel-review-text">{review.text}</div>
            </div>
          ))}
        </div>
      )}

      <button className="business-panel-directions" onClick={onGetDirections}>
        Directions
      </button>
    </div>
  );
}
