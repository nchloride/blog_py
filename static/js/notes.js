let _allNotes = [];

function sanitizeTitle(title) {
    return String(title || '').replace(/<[^>]*>/g, '').trim();
}

function updateCounter() {
    const len     = document.getElementById('note').value.length;
    const counter = document.getElementById('charCounter');
    counter.textContent = `${len} / 500`;
    counter.className   = 'char-counter' + (len > 450 ? ' warn' : '');
}

function showNoteMdTab(tab) {
    const ta      = document.getElementById('note');
    const preview = document.getElementById('note-preview-area');
    const wBtn    = document.getElementById('note-tab-write');
    const pBtn    = document.getElementById('note-tab-preview');
    if (tab === 'preview') {
        preview.innerHTML = marked.parse(ta.value || '_Nothing to preview yet._');
        ta.style.display      = 'none';
        preview.style.display = 'block';
        wBtn.classList.remove('active');
        pBtn.classList.add('active');
    } else {
        preview.style.display = 'none';
        ta.style.display      = 'block';
        ta.focus();
        pBtn.classList.remove('active');
        wBtn.classList.add('active');
    }
}

function clearForm() {
    ['title', 'note', 'tagsInput'].forEach(id => document.getElementById(id).value = '');
    tags.length = 0; renderTags(); updateCounter();
    showNoteMdTab('write');
}

async function submitNote() {
    const title = document.getElementById('title').value.trim();
    const note  = document.getElementById('note').value.trim();
    const btn   = document.getElementById('submitBtn');

    if (!title) { showToast('⚠️ Title is required.', 'error'); return; }
    if (!note)  { showToast('⚠️ Note body is required.', 'error'); return; }

    btn.disabled = true; btn.textContent = 'Saving…';

    try {
        const res  = await fetch('/api/add', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ title, note, tags: tags.join(',') })
        });
        const data = await res.json();
        if (data.Status === 'Note added') {
            showToast('✅ Note saved!', 'success');
            clearForm();
            loadNotes();
        } else {
            showToast('⚠️ ' + (data.message || JSON.stringify(data)), 'error');
        }
    } catch (err) {
        showToast('❌ Request failed: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Save Note';
    }
}

function renderNotesList(notes) {
    const list = document.getElementById('notesList');
    if (!notes.length) {
        list.innerHTML = '<div class="notes-empty">No notes match your search.</div>';
        return;
    }
    list.innerHTML = notes.map(n => {
        const tagsHtml = n.tags
            ? n.tags.split(',').filter(t => t.trim())
                .map(t => `<span class="tag-chip">#${escHtml(t.trim())}</span>`).join('')
            : '';
        const idJson = JSON.stringify(n._id);
        return `
        <div class="note-card">
            <div class="note-card-header">
                <div class="note-card-title">${escHtml(n.title)}</div>
                <div class="note-card-actions">
                    <button class="note-edit-btn" onclick='openNoteEditModal(${idJson})' title="Edit note">
                        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    </button>
                    <button class="note-delete-btn" onclick='deleteNote(${idJson})' title="Delete note">
                        <svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>
                </div>
            </div>
            <div class="note-card-body note-card-body--md">${marked.parse(n.note || '')}</div>
            ${tagsHtml ? `<div class="note-card-tags">${tagsHtml}</div>` : ''}
        </div>`;
    }).join('');
}

// ── Edit modal state ──────────────────────────────────────────────────────────

let _pendingEditId = null;

function openNoteEditModal(id) {
    const note = _allNotes.find(n => n._id === id);
    if (!note) { showToast('Note not found in cache — try refreshing.', 'error'); return; }

    _pendingEditId = id;

    document.getElementById('note-edit-title-display').textContent = note.title;
    document.getElementById('note-edit-body').value  = note.note  || '';
    document.getElementById('note-edit-tags').value  = note.tags  || '';

    document.getElementById('note-edit-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('note-edit-body').focus(), 50);
}

function closeNoteEditModal() {
    document.getElementById('note-edit-modal').style.display = 'none';
    _pendingEditId = null;
}

async function saveNoteEdit() {
    const id = _pendingEditId;
    if (!id) return;

    const noteBody = document.getElementById('note-edit-body').value.trim();
    const tags     = document.getElementById('note-edit-tags').value.trim();

    if (!noteBody) { showToast('Note body cannot be empty.', 'error'); return; }

    const btn = document.getElementById('note-edit-save-btn');
    btn.disabled    = true;
    btn.textContent = 'Saving…';

    try {
        const res = await fetch('/api/note', {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id, note: noteBody, tags })
        });
        const data = await res.json();
        if (res.ok && data.Status === 'Note updated') {
            showToast('Note updated.', 'success');
            closeNoteEditModal();
            loadNotes();
        } else {
            showToast('Error: ' + (data.error || JSON.stringify(data)), 'error');
        }
    } catch (err) {
        showToast('Request failed: ' + err.message, 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Save';
    }
}

function filterNotes(query) {
    const q = query.trim().toLowerCase();
    if (!q) { renderNotesList(_allNotes); return; }
    const filtered = _allNotes.filter(n => {
        const inTitle = n.title && n.title.toLowerCase().includes(q);
        const inTags  = n.tags  && n.tags.toLowerCase().includes(q);
        return inTitle || inTags;
    });
    renderNotesList(filtered);
}

async function loadNotes() {
    const list = document.getElementById('notesList');
    list.innerHTML = '<div class="notes-loading">Loading…</div>';
    try {
        const res   = await fetch('/api/notes');
        const notes = await res.json();
        const count = Array.isArray(notes) ? notes.length : 0;
        document.getElementById('notesCount').textContent = count;
        const badge = document.getElementById('notesCountBadge');
        if (badge) badge.textContent = count > 0 ? count : '';
        if (!res.ok || !Array.isArray(notes) || notes.length === 0) {
            _allNotes = [];
            list.innerHTML = '<div class="notes-empty">No notes yet. Add your first one above.</div>';
            return;
        }
        _allNotes = notes;
        // re-apply any active search query after reload
        const query = document.getElementById('notesSearch')?.value || '';
        filterNotes(query);
    } catch(e) {
        list.innerHTML = '<div class="notes-empty">Failed to load notes.</div>';
    }
}

let _pendingDeleteId = null;

function deleteNote(id) {
    _pendingDeleteId = id;
    const note = _allNotes.find(n => n._id === id);
    document.getElementById('note-delete-name').textContent = note ? note.title : id;
    document.getElementById('note-delete-modal').style.display = 'flex';
}

function closeNoteDeleteModal() {
    document.getElementById('note-delete-modal').style.display = 'none';
    _pendingDeleteId = null;
}

async function executeDeleteNote() {
    const id = _pendingDeleteId;
    closeNoteDeleteModal();
    if (!id) return;
    try {
        const res = await fetch('/api/delete', {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id })
        });
        const text = await res.text();
        if (text.includes('1')) {
            showToast('🗑️ Note deleted.', 'success');
            loadNotes();
        } else {
            showToast('⚠️ Note not found.', 'error');
        }
    } catch(e) {
        showToast('❌ Delete failed: ' + e.message, 'error');
    }
}
