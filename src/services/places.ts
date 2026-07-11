import { env } from "@/config/env";
import type { LatLng } from "@/utils/polyline";

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

export async function searchPlaces(query: string, biasLocation?: LatLng): Promise<PlacePrediction[]> {
  if (!query.trim()) return [];

  const params = new URLSearchParams({
    input: query,
    key: env.googlePlacesApiKey,
    types: "geocode",
  });
  if (biasLocation) {
    params.set("location", `${biasLocation.latitude},${biasLocation.longitude}`);
    params.set("radius", "50000");
  }

  const res = await fetch(
    `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
  );
  const json = await res.json();

  if (json.status !== "OK") return [];

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
    throw new Error(`Place details request failed: ${json.status}`);
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
