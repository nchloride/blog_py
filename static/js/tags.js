const tags = [];

function handleTagInput(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim().replace(/,/g, '');
        if (val && !tags.includes(val)) { tags.push(val); renderTags(); }
        e.target.value = '';
    }
    if (e.key === 'Backspace' && e.target.value === '' && tags.length) {
        tags.pop(); renderTags();
    }
}

function renderTags() {
    const row   = document.getElementById('tagsRow');
    const input = document.getElementById('tagsInput');
    row.querySelectorAll('.tag-chip').forEach(c => c.remove());
    tags.forEach((tag, i) => {
        const chip = document.createElement('div');
        chip.className = 'tag-chip';
        chip.innerHTML = `#${tag} <span class="remove" onclick="removeTag(${i})">✕</span>`;
        row.insertBefore(chip, input);
    });
}

function removeTag(i) { tags.splice(i, 1); renderTags(); }
