(function() {
    'use strict';

    const isTauri = Boolean(window.__TAURI_INTERNALS__)
        || window.location.protocol === 'tauri:'
        || window.location.hostname === 'tauri.localhost';
    if (!isTauri) return;

    const routes = [
        { file: 'editor.html', zh: '项目配置', en: 'Editor' },
        { file: 'index.html', zh: '日照分析', en: 'Analysis' }
    ];
    const currentFile = window.location.pathname.split('/').pop() || 'index.html';
    const navigation = document.createElement('nav');
    navigation.className = 'desktop-view-tabs';
    navigation.setAttribute('aria-label', 'Application views');

    function currentLanguage() {
        if (typeof i18n !== 'undefined') return i18n.getCurrentLanguage();
        return document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    }

    function updateLabels() {
        const language = currentLanguage();
        navigation.querySelectorAll('a').forEach((link, index) => {
            link.textContent = routes[index][language] || routes[index].en;
        });
        navigation.setAttribute('aria-label', language === 'zh' ? '应用视图' : 'Application views');
    }

    routes.forEach(route => {
        const link = document.createElement('a');
        link.href = route.file;
        if (route.file === currentFile) {
            link.className = 'is-active';
            link.setAttribute('aria-current', 'page');
        }
        navigation.appendChild(link);
    });

    document.body.classList.add('desktop-runtime');
    document.body.appendChild(navigation);
    updateLabels();

    document.querySelectorAll('.lang-btn').forEach(button => {
        button.addEventListener('click', () => setTimeout(updateLabels, 0));
    });
})();
