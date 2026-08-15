// Real YouTube Data API v3 search -- lets the AI Site Builder find and embed actual,
// existing videos (e.g. real basketball highlight/news clips) matching what a site plan
// section calls for, instead of only ever generating text/images. Requires a Google Cloud
// API key with the "YouTube Data API v3" enabled (console.cloud.google.com -> APIs &
// Services -> Library -> enable it -> Credentials -> Create API key), stored as the
// YOUTUBE_API_KEY Firebase secret.
//
// Only ever returns a real video's id/title -- the actual video stays hosted on YouTube and
// is played back through YouTube's own embed player (see VideoEmbedElement), never
// downloaded or re-hosted, which YouTube's Terms of Service don't allow.

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
}

export async function searchYouTubeVideo(apiKey: string, query: string): Promise<YouTubeSearchResult | null> {
  const url = new URL(YOUTUBE_SEARCH_URL);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('safeSearch', 'strict');
  url.searchParams.set('q', query);
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`YouTube search failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    items?: { id?: { videoId?: string }; snippet?: { title?: string } }[];
  };
  const first = data.items?.[0];
  const videoId = first?.id?.videoId;
  if (!videoId) return null;
  return { videoId, title: first?.snippet?.title ?? query };
}
