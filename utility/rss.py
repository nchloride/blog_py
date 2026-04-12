"""
RSS / YouTube feed utilities.
Dwight's note: Never trust external input. Validate everything. A weak RSS parser
is like leaving Schrute Farms unlocked — anyone can walk in.
"""
import re
import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── YouTube feed base URL ──────────────────────────────────────────────────────
_YT_FEED_BASE = "https://www.youtube.com/feeds/videos.xml?channel_id="
_YT_CHANNEL_ID_RE = re.compile(r"^UC[\w-]{22}$")
_YT_CHANNEL_ID_IN_URL_RE = re.compile(r"/channel/(UC[\w-]{22})")
_YT_CHANNEL_ID_JSON_RE = re.compile(r'"channelId"\s*:\s*"(UC[\w-]{22})"')

# Limit page scrape size — we are not downloading the entire internet
_SCRAPE_MAX_BYTES = 512 * 1024  # 512 KB is more than enough


def _resolve_youtube(url: str) -> tuple[str, str]:
    """
    Given a URL that references YouTube in some form, return
    (feed_url, 'youtube'). Tries several strategies in order:
      1. Already a feed URL → return as-is
      2. /channel/UCxxx path → extract ID, build feed URL
      3. Scrape the page for channelId JSON key
      4. Fallback: look for <link rel="alternate" type="application/rss+xml">
    Raises ValueError if resolution fails.
    """
    # Already a feed URL
    if "feeds/videos.xml" in url:
        return url, "youtube"

    # Direct /channel/UCxxx path
    m = _YT_CHANNEL_ID_IN_URL_RE.search(url)
    if m:
        return _YT_FEED_BASE + m.group(1), "youtube"

    # Need to scrape — fetch page with a real UA, stream to avoid huge downloads
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
    }
    try:
        resp = requests.get(url, headers=headers, timeout=10, stream=True)
        resp.raise_for_status()
        # Read only what we need — no more
        raw = b""
        for chunk in resp.iter_content(chunk_size=8192):
            raw += chunk
            if len(raw) >= _SCRAPE_MAX_BYTES:
                break
        text = raw.decode("utf-8", errors="replace")
    except requests.RequestException as exc:
        raise ValueError(f"Failed to fetch YouTube page: {exc}") from exc

    # Strategy 3 — JSON channelId in page source
    m = _YT_CHANNEL_ID_JSON_RE.search(text)
    if m:
        return _YT_FEED_BASE + m.group(1), "youtube"

    # Strategy 4 — RSS <link> meta tag
    soup = BeautifulSoup(text, "html.parser")
    link_tag = soup.find("link", rel="alternate", type="application/rss+xml")
    if link_tag and link_tag.get("href"):
        href = link_tag["href"]
        # Make sure it actually looks like a YT feed
        if "channel_id=" in href:
            return href, "youtube"

    raise ValueError(f"Could not resolve YouTube channel ID from: {url}")


def resolve_feed_url(raw: str) -> tuple[str, str]:
    """
    Given raw user input (bare channel ID, YouTube URL, or plain RSS URL),
    return (canonical_url, type) where type is 'youtube' or 'rss'.

    Security note: we intentionally do NOT follow redirects blindly here —
    the caller should validate the returned URL scheme before storing it.
    """
    raw = raw.strip()

    if not raw:
        raise ValueError("Feed URL must not be empty.")

    # Bare YouTube channel ID
    if _YT_CHANNEL_ID_RE.match(raw):
        return _YT_FEED_BASE + raw, "youtube"

    # Any YouTube URL variant
    if "youtube.com" in raw or "youtu.be" in raw:
        return _resolve_youtube(raw)

    # Everything else is treated as a plain RSS/Atom feed
    # Basic scheme validation — SSRF mitigation: only http/https allowed
    if not raw.startswith(("http://", "https://")):
        raise ValueError("Feed URL must start with http:// or https://")

    return raw, "rss"


def _parse_published(entry) -> datetime:
    """
    Extract and normalise a publish date from a feedparser entry.
    Returns a timezone-aware UTC datetime, falling back to epoch on failure.
    """
    # feedparser provides published_parsed as a time.struct_time in UTC
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        try:
            return datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        except Exception:
            pass

    # Fallback: try the raw string
    if hasattr(entry, "published") and entry.published:
        try:
            return parsedate_to_datetime(entry.published).astimezone(timezone.utc)
        except Exception:
            pass

    # Absolute fallback — epoch so it sorts to the bottom
    return datetime(1970, 1, 1, tzinfo=timezone.utc)


def _extract_thumbnail(entry) -> str | None:
    """
    Try to find a thumbnail URL from a YouTube feedparser entry.
    Checks media_thumbnail then media_content.
    """
    # media:thumbnail — most common for YouTube feeds
    thumbnails = getattr(entry, "media_thumbnail", None)
    if thumbnails and isinstance(thumbnails, list) and thumbnails:
        url = thumbnails[0].get("url")
        if url:
            return url

    # media:content fallback
    contents = getattr(entry, "media_content", None)
    if contents and isinstance(contents, list) and contents:
        url = contents[0].get("url")
        if url:
            return url

    return None


def _clean_summary(entry) -> str:
    """
    Return a plain-text, HTML-stripped, 220-char-truncated summary.
    Uses BeautifulSoup for robust HTML stripping — never trust raw HTML from
    external feeds (OWASP A03: Injection).
    """
    raw = ""
    if hasattr(entry, "summary") and entry.summary:
        raw = entry.summary
    elif hasattr(entry, "description") and entry.description:
        raw = entry.description
    elif hasattr(entry, "content") and entry.content:
        raw = entry.content[0].get("value", "")

    if not raw:
        return ""

    text = BeautifulSoup(raw, "html.parser").get_text(separator=" ").strip()
    # Collapse multiple whitespace
    text = re.sub(r"\s+", " ", text)
    return text[:220] + ("…" if len(text) > 220 else "")


def fetch_feeds(feed_docs: list[dict], limit: int = 60) -> list[dict]:
    """
    Fetch all stored feeds and return a merged, newest-first list of articles.

    Args:
        feed_docs: list of dicts with keys: url, label, type
        limit:     max total articles to return (default 60)

    Returns:
        List of article dicts, each with keys:
          title, link, summary, published (ISO string), source, type, thumbnail
    """
    articles = []

    for feed_doc in feed_docs:
        url   = feed_doc.get("url", "")
        label = feed_doc.get("label", url)
        ftype = feed_doc.get("type", "rss")

        if not url:
            continue

        try:
            parsed = feedparser.parse(url)
        except Exception as exc:
            logger.warning("feedparser failed for %s: %s", url, exc)
            continue

        # feedparser swallows most errors, but status can indicate failure
        status = getattr(parsed, "status", 200)
        if status >= 400:
            logger.warning("Feed %s returned HTTP %s", url, status)
            continue

        entries = parsed.entries[:20]  # cap per feed to avoid abuse
        for entry in entries:
            title     = getattr(entry, "title", "(no title)")
            link      = getattr(entry, "link",  "")
            published = _parse_published(entry)
            summary   = _clean_summary(entry)
            thumbnail = _extract_thumbnail(entry) if ftype == "youtube" else None

            articles.append({
                "title":     title,
                "link":      link,
                "summary":   summary,
                "published": published.isoformat(),
                "source":    label,
                "type":      ftype,
                "thumbnail": thumbnail,
            })

    # Sort newest-first — a security analyst needs the latest intel immediately
    articles.sort(key=lambda a: a["published"], reverse=True)
    return articles[:limit]
