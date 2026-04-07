async function loadCVEs() {
    const list       = document.getElementById('storyList');
    const refreshBtn = document.getElementById('refreshBtn');

    list.innerHTML = Array(5).fill(0).map(() => `
        <div class="skel-card">
            <div class="skeleton skel-circle"></div>
            <div class="skel-lines">
                <div class="skeleton skel-line" style="width:90%"></div>
                <div class="skeleton skel-line" style="width:55%"></div>
            </div>
        </div>
    `).join('');

    refreshBtn.classList.add('spinning');

    try {
        const res     = await fetch('/cve?api=true');
        const stories = await res.json();

        if (!Array.isArray(stories) || stories.length === 0) {
            list.innerHTML = '<div class="feed-error">⚠️ No stories found.</div>';
            return;
        }

        document.getElementById('cveCount').textContent = stories.length;

        list.innerHTML = stories.map(s => `
            <a class="story-card" href="${s.link}" target="_blank" rel="noopener">
                <div class="story-icon">
                    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                </div>
                <div class="story-body">
                    <div class="story-title-text">${escHtml(s.title)}</div>
                    <div class="story-source">
                        <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm-1 17.93V18a1 1 0 0 1 2 0v1.93A8.001 8.001 0 0 1 4.07 13H6a1 1 0 0 1 0 2H4.07A8.001 8.001 0 0 1 11 4.07V6a1 1 0 0 1 2 0V4.07A8.001 8.001 0 0 1 19.93 11H18a1 1 0 0 1 0-2h1.93A8.001 8.001 0 0 1 13 19.93z"/></svg>
                        The Hacker News
                    </div>
                </div>
                <span class="story-arrow">›</span>
            </a>
        `).join('');

    } catch (err) {
        list.innerHTML = `<div class="feed-error">❌ Failed to load CVEs.</div>`;
    } finally {
        refreshBtn.classList.remove('spinning');
    }
}

loadCVEs();
