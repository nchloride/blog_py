/**
 * newsfeed.js — RSS / YouTube feed manager and article renderer
 *
 * Follows the same fetch/toast/escHtml patterns as notes.js and cve.js.
 * Security note: ALL user-derived content (titles, summaries, source labels)
 * is passed through escHtml() before insertion into the DOM.
 * Never use innerHTML with untrusted data directly — that is how XSS happens.
 */

// ── Feed Manager ──────────────────────────────────────────────────────────────

/**
 * Fetch all saved feeds from the API and render the #feeds-list element.
 */
async function loadFeeds() {
    const list = document.getElementById('feeds-list');
    if (!list) return;

    list.innerHTML = '<div class="notes-loading">Loading subscriptions…</div>';

    try {
        const res   = await fetch('/api/feeds');
        const feeds = await res.json();

        if (!Array.isArray(feeds) || feeds.length === 0) {
            list.innerHTML = '<div class="notes-empty" style="padding:16px 20px;">No feeds yet. Add one above.</div>';
            return;
        }

        list.innerHTML = feeds.map(f => {
            const isYt    = f.type === 'youtube';
            const badge   = isYt
                ? '<span class="feed-type-badge yt">YT</span>'
                : '<span class="feed-type-badge rss">RSS</span>';
            const safeUrl   = escHtml(f.url   || '');
            const safeLabel = escHtml(f.label || f.url || '');

            return `
            <div class="feed-row">
                <div class="feed-row-info">
                    <div class="feed-row-label">${safeLabel} ${badge}</div>
                    <div class="feed-row-url" title="${safeUrl}">${safeUrl}</div>
                </div>
                <button class="btn-danger-icon" onclick='deleteFeed("${escHtml(f.url)}")' title="Remove feed">
                    <svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
            </div>`;
        }).join('');

    } catch (err) {
        list.innerHTML = '<div class="feed-error">Failed to load feeds.</div>';
    }
}

/**
 * Read the URL and label inputs, POST to /api/feeds, then reload both
 * the feeds list and the articles.
 */
async function addFeed() {
    const urlInput   = document.getElementById('feed-url-input');
    const labelInput = document.getElementById('feed-label-input');

    const url   = (urlInput.value   || '').trim();
    const label = (labelInput.value || '').trim();

    if (!url) {
        showToast('Enter a feed URL or YouTube channel link.', 'error');
        urlInput.focus();
        return;
    }

    // Disable inputs during request to prevent double-submit
    const btn = document.querySelector('#newsfeedView .submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Subscribing…'; }

    try {
        const res  = await fetch('/api/feeds', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ url, label })
        });
        const data = await res.json();

        if (res.status === 409) {
            showToast('Feed already subscribed.', 'error');
            return;
        }
        if (!res.ok) {
            showToast('Error: ' + escHtml(data.error || 'Unknown error'), 'error');
            return;
        }

        showToast('Feed subscribed!', 'success');
        urlInput.value   = '';
        labelInput.value = '';
        await loadFeeds();
        await loadNewsfeed();

    } catch (err) {
        showToast('Request failed: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Subscribe'; }
    }
}

/**
 * Delete a feed by URL, then reload feeds list and articles.
 * @param {string} url - the canonical feed URL to remove
 */
async function deleteFeed(url) {
    try {
        const res  = await fetch('/api/feeds?url=' + encodeURIComponent(url), { method: 'DELETE' });
        const data = await res.json();

        if (data.deleted > 0) {
            showToast('Feed removed.', 'success');
        } else {
            showToast('Feed not found.', 'error');
        }
        await loadFeeds();
        await loadNewsfeed();

    } catch (err) {
        showToast('Delete failed: ' + err.message, 'error');
    }
}

// ── Feeds panel toggle ────────────────────────────────────────────────────────

let _feedsPanelVisible = true;

function toggleFeedsPanel() {
    const body   = document.getElementById('feeds-panel-body');
    const icon   = document.getElementById('feeds-toggle-icon');
    const btn    = document.getElementById('feeds-toggle-btn');
    if (!body) return;

    _feedsPanelVisible = !_feedsPanelVisible;
    body.style.display    = _feedsPanelVisible ? 'block' : 'none';
    icon.style.transform  = _feedsPanelVisible ? 'rotate(0deg)' : 'rotate(-90deg)';
    btn.childNodes[btn.childNodes.length - 1].textContent = _feedsPanelVisible ? 'Hide' : 'Show';
}

// ── Article Feed ──────────────────────────────────────────────────────────────

/**
 * Fetch live articles from /api/newsfeed and render the #newsfeed-articles list.
 * Shows skeleton loading cards while waiting, spins the refresh button.
 */
async function loadNewsfeed() {
    const list       = document.getElementById('newsfeed-articles');
    const refreshBtn = document.getElementById('newsfeed-refresh-btn');
    if (!list) return;

    list.innerHTML = Array(6).fill(0).map(() => `
        <div class="skel-card">
            <div class="skeleton skel-circle"></div>
            <div class="skel-lines">
                <div class="skeleton skel-line" style="width:88%"></div>
                <div class="skeleton skel-line" style="width:52%"></div>
            </div>
        </div>
    `).join('');

    if (refreshBtn) refreshBtn.classList.add('spinning');

    try {
        const res      = await fetch('/api/newsfeed');
        const articles = await res.json();

        if (!Array.isArray(articles) || articles.length === 0) {
            list.innerHTML = '<div class="feed-error">No articles found. Add a feed above to get started.</div>';
            return;
        }

        list.innerHTML = articles.map(a => _renderArticleCard(a)).join('');

    } catch (err) {
        list.innerHTML = '<div class="feed-error">Failed to load articles. Check your network connection.</div>';
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('spinning');
    }
}

/**
 * Render a single article as a .story-card element string.
 * All user-derived fields are escaped through escHtml().
 * YouTube articles show a thumbnail; RSS articles show a generic icon.
 *
 * @param {Object} a - article object from /api/newsfeed
 * @returns {string} HTML string for one story card
 */
function _renderArticleCard(a) {
    const isYt        = a.type === 'youtube';
    const safeTitle   = escHtml(a.title   || '(no title)');
    const safeSource  = escHtml(a.source  || '');
    const safeSummary = escHtml(a.summary || '');
    const safeLink    = escHtml(a.link    || '#');

    // Build the left icon/thumbnail region
    let iconHtml;
    if (isYt && a.thumbnail) {
        // Thumbnail URL from YouTube's own CDN — safe to use in src after escaping
        const safeThumb = escHtml(a.thumbnail);
        iconHtml = `<img class="yt-thumbnail" src="${safeThumb}" alt="${safeTitle}" loading="lazy">`;
    } else if (isYt) {
        // YouTube but no thumbnail — show YT icon with red tint
        iconHtml = `
        <div class="story-icon" style="background:rgba(255,0,0,0.1);border-color:rgba(255,0,0,0.2)">
            <svg viewBox="0 0 24 24" fill="#ff4444"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
        </div>`;
    } else {
        // Generic RSS icon
        iconHtml = `
        <div class="story-icon" style="background:var(--accent-dim);border-color:rgba(99,102,241,0.2)">
            <svg viewBox="0 0 24 24" fill="var(--accent)"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
        </div>`;
    }

    // Source line: YouTube articles get a red YT badge
    const sourceBadge = isYt
        ? ' <span class="yt-badge">YT</span>'
        : '';

    // Format published date — it's an ISO string from the backend
    let dateStr = '';
    if (a.published) {
        try {
            const d = new Date(a.published);
            dateStr = d.getFullYear() > 1970
                ? ' · ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                : '';
        } catch (_) { /* ignore bad dates */ }
    }

    return `
    <a class="story-card" href="${safeLink}" target="_blank" rel="noopener noreferrer">
        ${iconHtml}
        <div class="story-body">
            <div class="story-title-text">${safeTitle}</div>
            ${safeSummary ? `<div class="story-summary">${safeSummary}</div>` : ''}
            <div class="story-source">
                <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm-1 17.93V18a1 1 0 0 1 2 0v1.93A8.001 8.001 0 0 1 4.07 13H6a1 1 0 0 1 0 2H4.07A8.001 8.001 0 0 1 11 4.07V6a1 1 0 0 1 2 0V4.07A8.001 8.001 0 0 1 19.93 11H18a1 1 0 0 1 0-2h1.93A8.001 8.001 0 0 1 13 19.93z"/></svg>
                ${safeSource}${sourceBadge}${dateStr}
            </div>
        </div>
        <span class="story-arrow">›</span>
    </a>`;
}
