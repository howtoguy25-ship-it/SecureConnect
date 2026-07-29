import { env } from "@/config/env";
import type { LatLng } from "@/utils/polyline";
import { Sentry } from "@/services/sentry";

export interface PlacePrediction {
  placeId: string;
  primaryText: string;
  secondaryText: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  location: LatLng;
}

export class PlacesApiError extends Error {
  constructor(public status: string, message?: string) {
    super(message ? `${status}: ${message}` : status);
    this.name = "PlacesApiError";
  }
}

export async function searchPlaces(query: string, biasLocation?: LatLng): Promise<PlacePrediction[]> {
  if (!query.trim()) return [];

  // No `types` restriction -- Google's default returns addresses, suburbs/localities,
  // cities, regions, and countries (the "geocode" set) *plus* businesses/landmarks by name,
  // which a real navigation destination search needs too ("Starbucks", not just "123 Main
  // St"). Restricting to types:"geocode" (the old behavior) silently excluded every
  // establishment result.
  const params = new URLSearchParams({
    input: query,
    key: env.googlePlacesApiKey,
  });
  if (biasLocation) {
    params.set("location", `${biasLocation.latitude},${biasLocation.longitude}`);
    params.set("radius", "50000");
  }

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
  );
  const json = await res.json();

  // ZERO_RESULTS is a normal, silent empty-list outcome (nothing matches yet, still typing).
  // Everything else (REQUEST_DENIED, INVALID_REQUEST, OVER_QUERY_LIMIT, UNKNOWN_ERROR) is a
  // real failure -- most commonly an API-key restriction issue, since a plain fetch() from
  // JS doesn't send the iOS/Android bundle-identifier headers that an "app-restricted" key
  // requires, unlike calls made through the native Maps SDK itself. This used to be silently
  // swallowed into an empty array indistinguishable from "no matches", which is exactly what
  // made this impossible to diagnose without a report like "the dropdown just never appears."
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    Sentry.logger.error("places: autocomplete request failed", {
      status: json.status,
      errorMessage: json.error_message,
      query,
    });
    throw new PlacesApiError(json.status, json.error_message);
  }
  if (json.status === "ZERO_RESULTS") return [];

  return json.predictions.map((p: any) => ({
    placeId: p.place_id,
    primaryText: p.structured_formatting?.main_text ?? p.description,
    secondaryText: p.structured_formatting?.secondary_text ?? "",
  }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const params = new URLSearchParams({
    place_id: placeId,
    key: env.googlePlacesApiKey,
    fields: "place_id,name,formatted_address,geometry",
  });

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
  );
  const json = await res.json();

  if (json.status !== "OK") {
    Sentry.logger.error("places: place details request failed", {
      status: json.status,
      errorMessage: json.error_message,
      placeId,
    });
    throw new PlacesApiError(json.status, json.error_message);
  }

  const result = json.result;
  return {
    placeId: result.place_id,
    name: result.name,
    address: result.formatted_address,
    location: {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
    },
  };
}
