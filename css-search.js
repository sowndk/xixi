/**
 * CSS 搜索功能
 * 用于在全局自定义 CSS 文本框中搜索关键词
 */

(function() {
    'use strict';
    
    // 等待 DOM 加载完成
    document.addEventListener('DOMContentLoaded', function() {
        const searchInput = document.getElementById('global-css-search-input');
        const prevBtn = document.getElementById('global-css-search-prev-btn');
        const nextBtn = document.getElementById('global-css-search-next-btn');
        const countSpan = document.getElementById('global-css-search-count');
        const textarea = document.getElementById('global-css-input');
        
        // 检查元素是否存在
        if (!searchInput || !prevBtn || !nextBtn || !countSpan || !textarea) {
            console.warn('[CSS Search] Required elements not found');
            return;
        }
        
        let currentMatches = []; // 存储所有匹配的 {index, length}
        let currentIndex = -1;   // 当前高亮的匹配索引
        
        // 执行搜索
        function performSearch() {
            const keyword = searchInput.value.trim();
            currentMatches = [];
            currentIndex = -1;
            
            if (!keyword) {
                countSpan.textContent = '';
                textarea.setSelectionRange(0, 0);
                return;
            }
            
            const text = textarea.value;
            // 转义正则特殊字符
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedKeyword, 'gi');
            
            let match;
            while ((match = regex.exec(text)) !== null) {
                currentMatches.push({
                    index: match.index,
                    length: match[0].length
                });
            }
            
            // 更新计数显示
            if (currentMatches.length > 0) {
                countSpan.textContent = `0/${currentMatches.length}`;
                // 自动跳转到第一个匹配
                jumpToMatch(0);
            } else {
                countSpan.textContent = '0/0';
            }
        }
        
        // 跳转到指定的匹配项
        function jumpToMatch(index) {
            if (currentMatches.length === 0) return;
            
            // 循环索引
            if (index < 0) index = currentMatches.length - 1;
            if (index >= currentMatches.length) index = 0;
            
            currentIndex = index;
            const match = currentMatches[index];
            
            // 选中文本
            textarea.focus();
            textarea.setSelectionRange(match.index, match.index + match.length);
            
            // 计算行号并滚动到可见区域
            const textBeforeMatch = textarea.value.substring(0, match.index);
            const lineNumber = textBeforeMatch.split('\n').length;
            const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight) || 20;
            const scrollTop = Math.max(0, (lineNumber - 5) * lineHeight);
            textarea.scrollTop = scrollTop;
            
            // 临时高亮（通过黄色背景）
            const originalBg = textarea.style.backgroundColor;
            textarea.style.backgroundColor = 'rgba(255, 235, 59, 0.2)';
            setTimeout(() => {
                textarea.style.backgroundColor = originalBg;
            }, 300);
            
            // 更新计数
            countSpan.textContent = `${index + 1}/${currentMatches.length}`;
        }
        
        // 事件监听：搜索输入
        searchInput.addEventListener('input', function() {
            // 防抖：300ms 后执行搜索
            clearTimeout(searchInput._debounceTimer);
            searchInput._debounceTimer = setTimeout(performSearch, 300);
        });
        
        // 事件监听：回车键
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    // Shift+Enter: 上一个
                    jumpToMatch(currentIndex - 1);
                } else {
                    // Enter: 下一个
                    jumpToMatch(currentIndex + 1);
                }
            } else if (e.key === 'Escape') {
                // Esc: 清空搜索
                searchInput.value = '';
                countSpan.textContent = '';
                currentMatches = [];
                currentIndex = -1;
                searchInput.blur();
            }
        });
        
        // 事件监听：上一个按钮
        prevBtn.addEventListener('click', function() {
            jumpToMatch(currentIndex - 1);
        });
        
        // 事件监听：下一个按钮
        nextBtn.addEventListener('click', function() {
            jumpToMatch(currentIndex + 1);
        });
        
        // 事件监听：textarea 内容变化时重新搜索
        textarea.addEventListener('input', function() {
            if (searchInput.value.trim()) {
                clearTimeout(textarea._searchDebounce);
                textarea._searchDebounce = setTimeout(performSearch, 300);
            }
        });
        
        console.log('[CSS Search] Initialized successfully');
    });
})();
