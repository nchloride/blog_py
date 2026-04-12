let _currentEditName = null;

function switchFormTab(tab) {
    ['paths', 'notes'].forEach(t => {
        document.getElementById('ftab-' + t).classList.toggle('active', t === tab);
        document.getElementById('fpane-' + t).style.display = t === tab ? '' : 'none';
    });
}

function onPentestNoteInput(ta) {
    autoResizeMd(ta);
    const preview = document.getElementById('pentest-note-preview');
    if (ta.value.trim()) {
        preview.innerHTML = marked.parse(ta.value);
    } else {
        preview.innerHTML = '<span class="md-live-empty">Preview will appear here…</span>';
    }
}

function onMindmapInput(ta) {
    autoResizeMd(ta);
    const preview = document.getElementById('md-preview-area');
    if (ta.value.trim()) {
        preview.innerHTML = marked.parse(ta.value);
    } else {
        preview.innerHTML = '<span class="md-live-empty">Preview will appear here…</span>';
    }
}

function _setEditMode(isEdit) {
    const saveBtn = document.getElementById('mindmap-save-btn');
    saveBtn.textContent = isEdit ? 'Edit' : 'Save';
}

function markdownToAttackPath(md) {
    const lines  = md.split('\n');
    const result = [];
    let current  = null;

    for (const line of lines) {
        const h2 = line.match(/^##\s+(.+)/);
        if (h2) {
            current = { name: h2[1].trim(), paths: [] };
            result.push(current);
            continue;
        }
        if (!current) continue;
        const bullet = line.match(/^( *)- (.+)/);
        if (!bullet) continue;
        const depth = bullet[1].length;
        const name  = bullet[2].trim();
        if (depth === 0) {
            current._last1 = { name, paths: [] };
            current.paths.push(current._last1);
        } else if (depth <= 2) {
            const parent = current._last1;
            if (parent) {
                if (!parent.paths) parent.paths = [];
                parent._last2 = { name, paths: [] };
                parent.paths.push(parent._last2);
            }
        } else {
            const grandparent = current._last1 && current._last1._last2;
            if (grandparent) {
                if (!grandparent.paths) grandparent.paths = [];
                grandparent.paths.push({ name });
            }
        }
    }

    function clean(nodes) {
        return nodes.map(n => {
            const out = { name: n.name };
            if (n.paths && n.paths.length) out.paths = clean(n.paths);
            return out;
        });
    }
    return clean(result);
}

async function renderGraph(parsed, name, markdown, save, pentestNote, isEdit = false) {
    const params = new URLSearchParams({ name });

    if (save && isEdit) {
        // Edit: PUT to update, then POST without save to get the rendered graph
        const editParams = new URLSearchParams({ name, markdown, pentest_note: pentestNote || '' });
        await fetch('/api/attack-path?' + editParams.toString(), {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(parsed)
        });
    } else if (save) {
        params.set('save', 'true');
        params.set('markdown', markdown);
        params.set('pentest_note', pentestNote || '');
    }

    // Always POST for graph HTML (without save flag when editing)
    const renderParams = new URLSearchParams({ name });
    const res  = await fetch('/api/attack-path?' + (save && !isEdit ? params : renderParams).toString(), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(parsed)
    });
    const html = await res.text();

    const container = document.getElementById('mindmap-graph-container');
    container.innerHTML = html;

    document.querySelectorAll('script[data-mindmap]').forEach(s => s.remove());
    const scripts = container.querySelectorAll('script');
    const execNext = (i) => {
        if (i >= scripts.length) return;
        const old = scripts[i];
        if (old.src) {
            if (typeof d3 !== 'undefined') { execNext(i + 1); return; }
            const s = document.createElement('script');
            s.src = old.src;
            s.setAttribute('data-mindmap', '');
            s.onload = () => execNext(i + 1);
            document.head.appendChild(s);
        } else {
            const s = document.createElement('script');
            s.textContent = '(function(){\n' + old.textContent + '\n})();';
            s.setAttribute('data-mindmap', '');
            document.body.appendChild(s);
            execNext(i + 1);
        }
        old.remove();
    };
    execNext(0);

    document.getElementById('mindmap-graph-body').style.display      = 'none';
    document.getElementById('mindmap-graph-container').style.display = 'block';
}

const DEFAULT_MD = `## Login Portal
- SQL Injection
  - Blind SQLi
  - UNION Attack
- Brute Force
  - Dictionary Attack
  - Credential Stuffing

## API Endpoint
- JWT Bypass
- IDOR
- Rate Limit Bypass

## Admin Panel
- Default Credentials
- Password Reset Abuse`;

async function loadDefaultGraph() {
    const ta = document.getElementById('mindmap-textarea');
    if (!ta.value.trim()) ta.value = DEFAULT_MD;
    onMindmapInput(ta);
    try {
        const parsed = markdownToAttackPath(ta.value);
        if (parsed.length) await renderGraph(parsed, 'default', ta.value, false);
    } catch(_) {}
}

async function submitMindmap(save) {
    const errorEl = document.getElementById('mindmap-error');
    const genBtn  = document.getElementById('mindmap-submit-btn');
    const saveBtn = document.getElementById('mindmap-save-btn');
    const raw     = document.getElementById('mindmap-textarea').value.trim();
    const name    = document.getElementById('mindmap-name').value.trim();

    errorEl.textContent = '';

    if (save && !name) {
        errorEl.textContent = 'Map name is required to save.';
        document.getElementById('mindmap-name').focus();
        return;
    }

    let parsed;
    try {
        parsed = markdownToAttackPath(raw);
        if (!parsed.length) throw new Error('No ## headings found — add at least one root node');
    } catch (e) {
        errorEl.textContent = e.message;
        return;
    }

    const isEdit = !!_currentEditName;

    if (save) {
        saveBtn.disabled = true; saveBtn.textContent = isEdit ? 'Editing…' : 'Saving…';
    } else {
        genBtn.disabled = true; genBtn.textContent = 'Generating…';
    }

    const pentestNote = document.getElementById('pentest-note-textarea').value;
    try {
        await renderGraph(parsed, name || 'unnamed', raw, save, pentestNote, isEdit);
        if (save) {
            showToast(isEdit ? '✅ Attack path updated!' : '✅ Attack path saved!', 'success');
            loadAttackPaths();
        }
    } catch (err) {
        errorEl.textContent = 'Request failed: ' + err.message;
    } finally {
        genBtn.disabled  = false; genBtn.textContent = 'Generate Graph';
        saveBtn.disabled = false; _setEditMode(isEdit);
    }
}

async function analyzeWithClaude() {
    const pentestNote = document.getElementById('pentest-note-textarea').value.trim();
    const errorEl     = document.getElementById('mindmap-error');
    const btn         = document.getElementById('analyze-btn');

    errorEl.textContent = '';

    if (!pentestNote) {
        errorEl.textContent = 'Add a pentest note first (Pentest Note tab).';
        switchFormTab('notes');
        return;
    }

    btn.disabled = true; btn.textContent = 'Analyzing…';

    try {
        const res  = await fetch('/api/analyze-path', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ pentest_note: pentestNote })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Server error');

        const ta = document.getElementById('mindmap-textarea');
        ta.value = data.result;
        onMindmapInput(ta);
        switchFormTab('paths');
        showToast('✅ Attack path generated!', 'success');
    } catch (err) {
        errorEl.textContent = 'Analysis failed: ' + err.message;
    } finally {
        btn.disabled = false; btn.textContent = 'Analyze Note';
        btn.querySelector('svg').style.display = '';
    }
}

function showMindmapForm() {
    document.getElementById('mindmap-graph-container').innerHTML    = '';
    document.getElementById('mindmap-graph-container').style.display = 'none';
    document.getElementById('mindmap-graph-body').style.display     = 'flex';
}

let _savedPaths = [];

async function loadAttackPaths() {
    try {
        const res   = await fetch('/api/attack-paths');
        _savedPaths = await res.json();
        const sel   = document.getElementById('saved-paths-select');
        const cur   = sel.value;
        sel.innerHTML = '<option value="">New attack path</option>';
        _savedPaths.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            sel.appendChild(opt);
        });
        if (cur && _savedPaths.some(p => p.name === cur)) sel.value = cur;
        document.getElementById('delete-path-btn').disabled = !sel.value;
    } catch(_) {}
}

function _clearMindmapForm() {
    const ta = document.getElementById('mindmap-textarea');
    ta.value = '';
    onMindmapInput(ta);
    document.getElementById('mindmap-name').value = '';
    const noteTA = document.getElementById('pentest-note-textarea');
    noteTA.value = '';
    onPentestNoteInput(noteTA);
    document.getElementById('mindmap-error').textContent = '';
    _currentEditName = null;
    _setEditMode(false);
}

function onPathSelect(name) {
    document.getElementById('delete-path-btn').disabled = !name;
    if (!name) {
        _clearMindmapForm();
        return;
    }
    const path = _savedPaths.find(p => p.name === name);
    if (!path) return;
    const ta = document.getElementById('mindmap-textarea');
    ta.value = path.markdown || '';
    onMindmapInput(ta);
    document.getElementById('mindmap-name').value = path.name;
    const noteTA = document.getElementById('pentest-note-textarea');
    noteTA.value = path.pentest_note || '';
    onPentestNoteInput(noteTA);
    _currentEditName = name;
    _setEditMode(true);
}

function confirmDeletePath() {
    const name = document.getElementById('saved-paths-select').value;
    if (!name) return;
    document.getElementById('delete-confirm-input').value = '';
    document.getElementById('confirm-delete-btn').disabled = true;
    document.getElementById('delete-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('delete-confirm-input').focus(), 50);
}

function closeDeleteModal() {
    document.getElementById('delete-modal').style.display = 'none';
}

function onDeleteInput(val) {
    document.getElementById('confirm-delete-btn').disabled = val !== 'delete';
}

async function executeDeletePath() {
    const name = document.getElementById('saved-paths-select').value;
    closeDeleteModal();
    try {
        const res  = await fetch('/api/attack-path?' + new URLSearchParams({ name }), { method: 'DELETE' });
        const data = await res.json();
        if (data.deleted) {
            showToast('🗑️ Attack path deleted.', 'success');
            document.getElementById('saved-paths-select').value = '';
            document.getElementById('delete-path-btn').disabled = true;
            loadAttackPaths();
        } else {
            showToast('⚠️ Path not found.', 'error');
        }
    } catch(e) {
        showToast('❌ Delete failed: ' + e.message, 'error');
    }
}
