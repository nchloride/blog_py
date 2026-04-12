function navigate(view) {
    const homeView      = document.getElementById('homeView');
    const composerView  = document.getElementById('composerView');
    const mindmapView   = document.getElementById('mindmapView');
    const newsfeedView  = document.getElementById('newsfeedView');
    const topbar        = document.getElementById('topbarTitle');
    const navHome       = document.getElementById('nav-home');
    const navAdd        = document.getElementById('nav-addnote');
    const navMindmap    = document.getElementById('nav-mindmap');
    const navNewsfeed   = document.getElementById('nav-newsfeed');

    // Hide all views
    homeView.style.display     = 'none';
    composerView.style.display = 'none';
    mindmapView.style.display  = 'none';
    newsfeedView.style.display = 'none';

    // Deactivate all nav items
    navHome.classList.remove('active');
    navAdd.classList.remove('active');
    navMindmap.classList.remove('active');
    navNewsfeed.classList.remove('active');

    if (view === 'home') {
        homeView.style.display = 'block';
        topbar.textContent     = 'Dashboard';
        navHome.classList.add('active');
    } else if (view === 'mindmap') {
        mindmapView.style.display = 'block';
        topbar.textContent        = 'Attack Map';
        navMindmap.classList.add('active');
        loadAttackPaths();
        if (!document.getElementById('mindmap-graph-container').innerHTML.trim()) {
            loadDefaultGraph();
        }
    } else if (view === 'newsfeed') {
        newsfeedView.style.display = 'block';
        topbar.textContent         = 'Newsfeed';
        navNewsfeed.classList.add('active');
        loadFeeds();
        loadNewsfeed();
    } else {
        composerView.style.display = 'block';
        topbar.textContent         = 'Notes';
        navAdd.classList.add('active');
        document.getElementById('title').focus();
        loadNotes();
    }
}
