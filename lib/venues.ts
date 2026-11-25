import 'server-only';

import { demoVenueMatches } from './demo';

export type VenueMatch = { label: string; latitude: number; longitude: number };

type GeocoderResult = {
  formatted?: string;
  lat?: number;
  lon?: number;
  result_type?: string;
  rank?: { confidence?: number };
  datasource?: { sourcename?: string };
};

export async function lookupVenue(venue: string, city: string): Promise<VenueMatch[]> {
  const name = venue.trim();
  const locality = city.trim();
  if (!name) return [];

  const fixture = demoVenueMatches(name, locality);
  if (fixture) return fixture;

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) return [];

  const url = new URL('https://api.geoapify.com/v1/geocode/search');
  url.search = new URLSearchParams({
    text: [name, locality].filter(Boolean).join(', '),
    format: 'json',
    limit: '8',
    apiKey,
  }).toString();

  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3500) });
    if (!response.ok) return [];

    const { results }: { results?: GeocoderResult[] } = await response.json();
    if (!Array.isArray(results)) return [];

    const matches = new Map<string, { place: VenueMatch; confidence: number }>();
    for (const result of results) {
      // The saved match omits source metadata, so keep results covered by the map's OpenStreetMap attribution.
      if (result?.datasource?.sourcename !== 'openstreetmap') continue;

      const { formatted, lat, lon, result_type } = result;
      const confidence = result.rank?.confidence;
      const precise = result_type === 'amenity' || result_type === 'building';
      const streetAddress = result_type === 'street' && !/\d/.test(name);
      if ((!precise && !streetAddress) || typeof confidence !== 'number' || confidence < 0.65) continue;
      if (typeof formatted !== 'string' || !formatted.trim()) continue;
      if (typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90) continue;
      if (typeof lon !== 'number' || !Number.isFinite(lon) || Math.abs(lon) > 180) continue;

      const position = [lat, lon].join(',');
      if (confidence <= (matches.get(position)?.confidence ?? 0)) continue;
      matches.set(position, { place: { label: formatted.trim(), latitude: lat, longitude: lon }, confidence });
    }

    const candidates = [...matches.values()].sort((a, b) => b.confidence - a.confidence);
    if (candidates.length === 1 && candidates[0].confidence < 0.9) return [];
    return candidates.map(({ place }) => place);
  } catch {
    return [];
  }
}
