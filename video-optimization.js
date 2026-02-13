
/**
 * 视频通话优化功能脚本
 * 用于管理视频通话设置界面，并在通话时应用静态图片覆盖
 */

(function() {
    // --- 核心拦截器：强制修改 AI 指令 ---
    // 保存原始 fetch
    const originalFetch = window.fetch;
    
    window.fetch = async function(url, options) {
        // 检查是否是图片请求，图片请求直接放行
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)/i) || 
            (options && options.headers && options.headers['Accept'] && options.headers['Accept'].includes('image'))) {
            return originalFetch.apply(this, arguments);
        }
        
        // 1. 检查是否处于视频通话模式（使用 visibility 和 opacity 判断）
        const videoScreen = document.getElementById('video-call-screen');
        let isVideoCallActive = false;
        if (videoScreen) {
            const styles = window.getComputedStyle(videoScreen);
            isVideoCallActive = styles.visibility === 'visible' && parseFloat(styles.opacity) > 0;
        }
        
        // 2. 只有在视频通话且请求包含 body 时才拦截
        if (isVideoCallActive && options && options.body) {
            try {
                // 尝试解析请求体
                let body = JSON.parse(options.body);
                
                // 3. 检查是否是发给 AI 的请求 (通常包含 messages 数组)
                if (body.messages && Array.isArray(body.messages)) {
                    console.log('[VideoOpt] Intercepting AI request to inject prompt...');
                    
                    // 4. 注入强力指令：禁止动作描写
                    // 策略：在 messages 末尾追加一条 system 消息，权重最高
                    const strictPrompt = "【系统强制指令】当前处于视频通话模式。你必须完全禁止任何动作、神态、心理或环境描写（如'看着镜头'、'手指敲击'等）。\n" +
                                       "你的回复必须仅包含直接的口语对白。\n" +
                                       "错误示例：*笑了笑* 你好啊。\n" +
                                       "正确示例：你好啊。";
                    
                    // 也可以尝试修改最后一条 user message，效果往往更好
                    const lastMsg = body.messages[body.messages.length - 1];
                    if (lastMsg && lastMsg.role === 'user') {
                        lastMsg.content += `\n\n(IMPORTANT: ${strictPrompt})`;
                    } else {
                         body.messages.push({
                            role: 'system',
                            content: strictPrompt
                        });
                    }

                    // 重新序列化 body
                    options.body = JSON.stringify(body);
                }
            } catch (e) {
                // 解析失败或非 JSON 请求，忽略
            }
        }
        
        // 继续执行原始请求
        return originalFetch.apply(this, arguments);
    };
    // --- 拦截器结束 ---

    const STORAGE_KEY = 'video_optimization_config';
    const DB_NAME = 'VideoOptimizationDB';
    const DB_STORE_NAME = 'images';
    
    const DEFAULT_CONFIG = {
        enabled: false,
        remoteImage: '', // URL or DataURL placeholder
        localImage: '',  // URL or DataURL placeholder
        useRealCamera: false
    };

    let config = { ...DEFAULT_CONFIG };
    
    // IndexedDB 简单封装
    const db = {
        open: () => {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
                        db.createObjectStore(DB_STORE_NAME);
                    }
                };
                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => reject(e);
            });
        },
        put: async (key, value) => {
            const dbInstance = await db.open();
            return new Promise((resolve, reject) => {
                const tx = dbInstance.transaction(DB_STORE_NAME, 'readwrite');
                const store = tx.objectStore(DB_STORE_NAME);
                const req = store.put(value, key);
                req.onsuccess = () => resolve();
                req.onerror = (e) => reject(e);
            });
        },
        get: async (key) => {
            const dbInstance = await db.open();
            return new Promise((resolve, reject) => {
                const tx = dbInstance.transaction(DB_STORE_NAME, 'readonly');
                const store = tx.objectStore(DB_STORE_NAME);
                const req = store.get(key);
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e);
            });
        }
    };

    // 初始化
    function init() {
        loadConfig();
        initSettingsUI();
        initVideoCallObserver();
        injectStyles(); // 注入美化样式
        console.log('Video Optimization Module Initialized');
    }

    // 注入自定义样式 (磨砂玻璃气泡)
    function injectStyles() {
        const styleId = 'video-opt-styles';
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* 
             * 核心修复：固定滚动区间 
             */
            #video-call-main {
                position: absolute !important;
                top: auto !important;
                bottom: 80px !important; /* 距离底部80px */
                left: 0 !important;
                width: 100% !important;
                
                /* 限制高度区间 */
                height: auto !important;
                max-height: 28vh !important; /* 文本区域占屏幕高度28% */
                
                /* 滚动机制 */
                overflow-y: auto !important;
                -webkit-overflow-scrolling: touch !important;
                scrollbar-width: none !important;
                
                display: flex !important;
                flex-direction: column !important;
                /* align-items: center !important;  <-- 移除居中，允许左右对齐 */
                
                background: transparent !important;
                box-shadow: none !important;
                border: none !important;
                z-index: 100 !important;
                
                pointer-events: auto !important;
                padding: 0 16px !important; /* 给左右留点空隙 */
                box-sizing: border-box !important;
            }

            /* 
             * 修复图标位置：强制沉底 
             */
            .video-call-controls {
                position: absolute !important;
                top: auto !important;
                bottom: 30px !important; /* 距离底部 30px */
                left: 0 !important;
                width: 100% !important;
                z-index: 500 !important;
                display: flex !important;
                justify-content: center !important; /* 按钮居中 */
                gap: 24px !important; /* 按钮之间的间距 */
                pointer-events: auto !important;
            }

            .video-call-top-bar,
            #minimize-call-btn,
            #video-call-restore-btn {
                z-index: 500 !important;
                position: absolute !important; /* 顶部元素保持绝对定位 */
                top: 0 !important;
            }

            img[src=""], img:not([src]) {
                opacity: 0 !important;
                visibility: hidden !important;
            }
            
            #video-call-main::-webkit-scrollbar {
                display: none !important;
            }

            /* 
             * 文本气泡样式 - 保留原始的左右对齐逻辑
             * 只添加视觉美化，不覆盖 align-self
             */
            #video-call-main > div,
            #video-call-main > .call-message-bubble {
                /* 视觉样式 - 磨砂玻璃效果 */
                background-color: rgba(60, 60, 60, 0.65) !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                
                border: 1px solid rgba(255, 255, 255, 0.15) !important;
                border-radius: 18px !important;
                box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.2) !important;
                
                /* 文本样式 */
                color: #ffffff !important;
                font-size: 16px !important;
                line-height: 1.5 !important;
                
                /* 布局与尺寸：自适应内容 */
                padding: 12px 16px !important;
                margin-top: 0 !important;
                margin-bottom: 5px !important; /* 气泡间距 5px */
                
                width: fit-content !important; /* 宽度随内容变化 */
                max-width: 80% !important;     /* 最大不超过 80% */
                
                pointer-events: auto !important;
                display: block !important;
            }
            
            /* 保留原项目的左右对齐规则 - 不用 !important */
            #video-call-main > .call-message-bubble.ai-speech {
                align-self: flex-start;
                border-bottom-left-radius: 4px; /* 左下角微尖 */
            }
            
            #video-call-main > .call-message-bubble.user-speech {
                align-self: flex-end;
                border-bottom-left-radius: 18px;
                border-bottom-right-radius: 4px; /* 右下角微尖 */
            }
            
            /* 隐藏头像区域 */
            #video-call-main .video-call-avatar-area,
            .video-call-avatar-area {
                display: none !important;
            }

            /* 隐藏名字/状态文本 */
            /* 假设名字通常显示在头像下方或特定的 info 区域 */
            /* 这里使用更通用的选择器来匹配非对话内容的短文本 */
            #video-call-main > div:not(.opt-text-bubble):not([class*="bubble"]) {
                 /* 
                  * 风险提示：如果对话气泡没有被正确识别为 bubble，可能会被误隐藏。
                  * 但现在的逻辑是所有直接子 div 都被强制样式化为气泡，
                  * 所以我们需要一种方式区分“名字”和“对话”。
                  * 
                  * 通常名字是较短的纯文本，或者是特定的 class。
                  * 如果名字是直接写在 #video-call-main 下的裸文本节点或 p 标签：
                  */
            }
            
            /* 针对已知结构：名字通常在 .video-call-name 或类似结构中 */
            .video-call-name,
            .video-call-status,
            #video-call-main h3, 
            #video-call-main h4 {
                display: none !important;
            }
            
            /* 
             * 激进隐藏策略：
             * 如果名字是作为 #video-call-main 的直接子元素存在的（且不是气泡），
             * 我们利用 CSS 文本特征或位置来隐藏它。
             * 但由于我们之前强制给所有子 div 加了气泡样式，名字现在可能变成了一个“小气泡”。
             * 
             * 解决方案：通过 JS 智能识别并标记名字节点，然后隐藏。
             */
        `;
        document.head.appendChild(style);
    }

    // 加载配置
    async function loadConfig() {
        // 1. 加载基础配置
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Failed to parse video config', e);
            }
        }
        
        // 2. 尝试从 IndexedDB 加载大图数据
        // 如果 config.remoteImage 是标记字符串，则去 DB 取
        if (config.remoteImage === 'indexeddb_remote') {
            try {
                const imgData = await db.get('remoteImage');
                if (imgData) config.remoteImage = imgData;
            } catch(e) { console.error('Failed to load remote image from DB', e); }
        }
        if (config.localImage === 'indexeddb_local') {
            try {
                const imgData = await db.get('localImage');
                if (imgData) config.localImage = imgData;
            } catch(e) { console.error('Failed to load local image from DB', e); }
        }
        
        // 重新更新 UI 以显示加载出的图片
        updateUIState();
        
        // 重新初始化图片显示（因为图片是异步加载的，UI可能已经初始化完了但没图）
        // 这里手动触发一次 display 更新
        const remotePreview = document.getElementById('remote-video-preview');
        if (remotePreview && config.remoteImage && config.remoteImage !== 'indexeddb_remote') {
             remotePreview.src = config.remoteImage;
             remotePreview.style.display = 'block';
             document.getElementById('remote-video-placeholder').style.display = 'none';
        }
        const localPreview = document.getElementById('local-video-preview');
        if (localPreview && config.localImage && config.localImage !== 'indexeddb_local') {
             localPreview.src = config.localImage;
             localPreview.style.display = 'block';
             document.getElementById('local-video-placeholder').style.display = 'none';
        }
    }

    // 保存配置
    async function saveConfig() {
        const configToSave = { ...config };
        
        // 检查图片大小，如果太大（>2MB），存入 IndexedDB
        // 或者是 DataURL 就存入 IndexedDB
        
        if (config.remoteImage && config.remoteImage.startsWith('data:')) {
            try {
                await db.put('remoteImage', config.remoteImage);
                configToSave.remoteImage = 'indexeddb_remote'; // 标记
            } catch (e) {
                console.error('Failed to save remote image to DB', e);
                alert('图片存储失败，请重试');
            }
        } else if (config.remoteImage === 'indexeddb_remote') {
            // 已经是标记了，不用动，或者意味着没变
        }
        
        if (config.localImage && config.localImage.startsWith('data:')) {
            try {
                await db.put('localImage', config.localImage);
                configToSave.localImage = 'indexeddb_local'; // 标记
            } catch (e) {
                console.error('Failed to save local image to DB', e);
            }
        } else if (config.localImage === 'indexeddb_local') {
             // no-op
        }

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(configToSave));
        } catch (e) {
            console.error('Failed to save main config', e);
        }
        
        updateUIState();
    }

    // 初始化设置界面 UI
    function initSettingsUI() {
        const switchEl = document.getElementById('enable-video-optimization-switch');
        const containerEl = document.getElementById('video-optimization-config-container');
        const realCameraSwitch = document.getElementById('enable-real-camera-switch');
        
        if (!switchEl) return; // UI not ready

        // 主开关
        switchEl.checked = config.enabled;
        containerEl.style.display = config.enabled ? 'block' : 'none';
        
        switchEl.addEventListener('change', (e) => {
            config.enabled = e.target.checked;
            containerEl.style.display = config.enabled ? 'block' : 'none';
            saveConfig();
        });

        // 真实摄像头开关
        if (realCameraSwitch) {
            realCameraSwitch.checked = config.useRealCamera;
            realCameraSwitch.addEventListener('change', (e) => {
                config.useRealCamera = e.target.checked;
                saveConfig();
            });
        }

        // 图片处理逻辑
        setupImageHandler('remote');
        setupImageHandler('local');
    }

    // 设置图片处理逻辑 (type: 'remote' | 'local')
    function setupImageHandler(type) {
        const previewId = `${type}-video-preview`;
        const placeholderId = `${type}-video-placeholder`;
        const inputId = `${type}-video-input`;
        const urlInputId = `${type}-video-url-input`;
        const urlBtnId = `${type}-video-url-btn`;
        const resetBtnId = `${type}-video-reset-btn`;
        const configKey = `${type}Image`;

        const previewEl = document.getElementById(previewId);
        const placeholderEl = document.getElementById(placeholderId);
        const inputEl = document.getElementById(inputId);
        const urlInputEl = document.getElementById(urlInputId);
        const urlBtnEl = document.getElementById(urlBtnId);
        const resetBtnEl = document.getElementById(resetBtnId);

        // 更新显示
        function updateDisplay() {
            const imgSrc = config[configKey];
            if (imgSrc) {
                previewEl.src = imgSrc;
                previewEl.style.display = 'block';
                placeholderEl.style.display = 'none';
                urlInputEl.value = imgSrc.startsWith('data:') ? '' : imgSrc;
            } else {
                previewEl.src = '';
                previewEl.style.display = 'none';
                placeholderEl.style.display = 'flex';
                urlInputEl.value = '';
            }
        }

        // 初始化显示
        updateDisplay();

        // 文件上传
        inputEl.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    config[configKey] = event.target.result;
                    saveConfig();
                    updateDisplay();
                };
                reader.readAsDataURL(file);
            }
        });

        // URL 上传按钮
        urlBtnEl.addEventListener('click', () => {
            const url = urlInputEl.value.trim();
            if (url) {
                config[configKey] = url;
                saveConfig();
                updateDisplay();
            }
        });
        
        // URL 输入框变化
        urlInputEl.addEventListener('change', () => {
             const url = urlInputEl.value.trim();
            if (url) {
                config[configKey] = url;
                saveConfig();
                updateDisplay();
            }
        });

        // 重置按钮
        resetBtnEl.addEventListener('click', () => {
            config[configKey] = '';
            saveConfig();
            updateDisplay();
        });
    }

    function updateUIState() {
        // 可以在这里触发全局状态更新，如果需要
    }

    // 监听视频通话界面
    function initVideoCallObserver() {
        const observer = new MutationObserver((mutations) => {
            const videoScreen = document.getElementById('video-call-screen');
            if (videoScreen && window.getComputedStyle(videoScreen).display !== 'none') {
                // 视频界面显示了
                // 检查是否已经初始化过本次通话的优化
                if (!videoScreen.dataset.optInitialized) {
                    videoScreen.dataset.optInitialized = 'true'; // 标记为已初始化
                    applyOptimization(videoScreen);
                }
            } else if (videoScreen && window.getComputedStyle(videoScreen).display === 'none') {
                // 视频界面隐藏了，重置标记，以便下次通话重新初始化
                delete videoScreen.dataset.optInitialized;
                // 清理文本监听器
                if (videoScreen._textObserver) {
                    videoScreen._textObserver.disconnect();
                    delete videoScreen._textObserver;
                }
            }
        });

        observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
    // 应用优化
    function applyOptimization(parent) {
        if (!config.enabled) return;

        // 0. 提升原有内容的层级，防止被背景遮挡
        // 查找关键的 UI 容器并提升 z-index
        const uiSelectors = [
            '.video-call-top-bar',
            '.video-call-avatar-area',
            '#video-call-main',
            '.video-call-controls'
        ];
        
        uiSelectors.forEach(selector => {
            const el = parent.querySelector(selector);
            if (el) {
                el.style.position = 'relative'; // 确保 z-index 生效
                el.style.zIndex = '10';         // 高于背景的 0
            }
        });

        // 1. 准备两个容器：Remote（对方） 和 Local（我方）
        const remoteContainer = getOrCreateContainer(parent, 'video-opt-remote-container');
        const localContainer = getOrCreateContainer(parent, 'video-opt-local-container');

        // 2. 填充内容
        updateRemoteContent(remoteContainer, config.remoteImage);
        updateLocalContent(localContainer, config.localImage, config.useRealCamera);

        // 3. 状态管理
        // 默认状态：swapped = false (Remote=背景, Local=小窗)
        let isSwapped = false;

        // 4. 定义布局更新函数
        function updateLayout() {
            if (!isSwapped) {
                // 默认模式
                applyBackgroundStyle(remoteContainer);
                applyFloatingStyle(localContainer);
                // 调整层级：背景在下，小窗在上
                remoteContainer.style.zIndex = '0';
                localContainer.style.zIndex = '200';
            } else {
                // 切换模式
                applyFloatingStyle(remoteContainer);
                applyBackgroundStyle(localContainer);
                // 调整层级
                remoteContainer.style.zIndex = '200';
                localContainer.style.zIndex = '0';
            }
        }

        // 5. 绑定点击事件 (点击小窗时切换)
        // 清除旧的监听器（如果有的话，防止闭包堆积，虽然这里逻辑上是新通话新元素，但为了保险）
        remoteContainer.onclick = null;
        localContainer.onclick = null;

        const toggleHandler = (e) => {
            // 阻止事件冒泡，防止触发底下的其他点击
            e.stopPropagation();
            isSwapped = !isSwapped;
            updateLayout();
        };

        // 只有当前处于 Floating 状态的容器响应点击
        
        remoteContainer.onclick = (e) => {
            if (isSwapped) toggleHandler(e); // isSwapped=true时，Remote是小窗
        };

        localContainer.onclick = (e) => {
            if (!isSwapped) toggleHandler(e); // isSwapped=false时，Local是小窗
        };

        // 6. 初始渲染
        updateLayout();

        // 7. 文本清洗 & 元素过滤 (隐藏名字/头像)
        function cleanTextNodes(element) {
            // 1. 尝试找到并隐藏头像/名字容器
            const avatarArea = element.querySelector('.video-call-avatar-area');
            if (avatarArea) avatarArea.style.display = 'none';

            // 2. 智能识别并隐藏名字节点
            // 策略：如果一个 div/p 内容很短（<10字符）且不包含标点，极大概率是名字
            // 2. 智能识别并隐藏名字节点
            // 原项目已经通过 .user-speech 和 .ai-speech class 处理了左右对齐
            // 这里只需要隐藏名字/状态节点
            const children = Array.from(element.children);
            children.forEach(el => {
                const text = el.textContent.trim();
                const cls = el.className || '';
                
                // 隐藏名字逻辑：极短文本 + 无标点 + 可能是特定的 class
                const isName = (text.length > 0 && text.length <= 8 && !/[。？！，、,.?!]/.test(text)) || 
                               cls.includes('name') || cls.includes('status');
                               
                if (isName) {
                    el.style.display = 'none';
                }
            });

            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
            let node;
            let hasChange = false;
            
            while (node = walker.nextNode()) {
                const text = node.textContent;
                // 匹配 *内容* 或 (内容) 或 （内容）
                const regex = /(\*.*?\*)|(\(.*?\))|（.*?）/g;
                if (regex.test(text)) {
                    node.textContent = text.replace(regex, '').trim();
                    hasChange = true;
                }
            }
            
            // 每次文本处理或有新内容时，尝试滚动到底部
            // 延迟一点点确保渲染完成
            setTimeout(() => {
                if (element.id === 'video-call-main') {
                    element.scrollTop = element.scrollHeight;
                } else {
                    // 如果传入的是子节点，找到主容器
                    const main = document.getElementById('video-call-main');
                    if (main) main.scrollTop = main.scrollHeight;
                }
            }, 50);
        }

        const mainContent = parent.querySelector('#video-call-main');
        if (mainContent) {
            // 初始清洗
            cleanTextNodes(mainContent);
            
            // 监听后续变化
            const observer = new MutationObserver((mutations) => {
                // 检查是否有新消息添加
                let hasNewMessage = false;
                mutations.forEach(m => {
                    if (m.type === 'childList' && m.addedNodes.length > 0) {
                        hasNewMessage = true;
                    }
                });
                
                if (hasNewMessage) {
                    cleanTextNodes(mainContent);
                }
            });
            
            observer.observe(mainContent, { 
                childList: true, 
                subtree: true, 
                characterData: true 
            });
            
            // 保存引用以便清理
            parent._textObserver = observer;
        }
    }
    }

    // 获取或创建通用容器
    function getOrCreateContainer(parent, id) {
        let container = document.getElementById(id);
        if (!container) {
            container = document.createElement('div');
            container.id = id;
            container.style.overflow = 'hidden'; // 确保圆角有效
            // 插入到 DOM
            if (parent.firstChild) {
                parent.insertBefore(container, parent.firstChild);
            } else {
                parent.appendChild(container);
            }
        }
        container.style.display = 'block';
        return container;
    }

    // 应用全屏背景样式
    function applyBackgroundStyle(el) {
        el.style.position = 'absolute';
        el.style.top = '0';
        el.style.left = '0';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.right = 'auto'; // 清除可能的小窗样式
        el.style.borderRadius = '0';
        el.style.border = 'none';
        el.style.boxShadow = 'none';
        el.style.backgroundColor = '#000';
    }

    // 应用悬浮小窗样式
    function applyFloatingStyle(el) {
        el.style.position = 'absolute';
        el.style.top = '80px';
        el.style.right = '20px';
        el.style.left = 'auto'; // 清除可能的背景样式
        el.style.width = '90px';
        el.style.height = '120px';
        el.style.borderRadius = '8px';
        el.style.border = 'none'; // 移除白色边框
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
        el.style.backgroundColor = '#000';
        el.style.cursor = 'pointer'; // 提示可点击
    }

    // 更新对方内容 (图片)
    function updateRemoteContent(container, imgSrc) {
        let img = container.querySelector('img');
        if (!img) {
            img = document.createElement('img');
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.backgroundColor = '#000'; // 黑色背景，避免白边
            // 默认隐藏，防止显示破损图标
            img.style.display = 'none';
            
            // 添加错误处理
            img.onerror = function() {
                console.warn('Failed to load remote image');
                this.style.display = 'none';
            };
            
            // 添加加载成功处理
            img.onload = function() {
                this.style.display = 'block';
            };
            
            container.appendChild(img);
        }
        
        if (imgSrc && imgSrc.length > 10) { // 简单校验
            img.src = imgSrc;
            // 不在这里设置 display，让 onload 处理
        } else {
            // 彻底清除 src 并隐藏
            img.removeAttribute('src');
            img.style.display = 'none';
        }
    }

    // 更新我方内容 (图片 或 摄像头)
    function updateLocalContent(container, imgSrc, useRealCamera) {
        let video = container.querySelector('video');
        let img = container.querySelector('img');

        if (useRealCamera) {
            // --- 摄像头模式 ---
            if (img) img.style.display = 'none';

            if (!video) {
                video = document.createElement('video');
                video.autoplay = true;
                video.muted = true;
                video.playsInline = true;
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                video.style.transform = 'scaleX(-1)';
                container.appendChild(video);
            }
            video.style.display = 'block';

            const isStreamActive = video.srcObject && video.srcObject.active;
            if (!isStreamActive) {
                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
                    .then(stream => {
                        video.srcObject = stream;
                        video.play().catch(e => console.error(e));
                    })
                    .catch(err => {
                        console.error('Camera error', err);
                        // 简单错误提示
                        if (!container.querySelector('.err')) {
                            const d = document.createElement('div');
                            d.className = 'err';
                            d.innerText = '无权限';
                            d.style.color='white';
                            d.style.position='absolute';
                            d.style.top='50%';
                            d.style.width='100%';
                            d.style.textAlign='center';
                            container.appendChild(d);
                        }
                    });
            }
        } else {
            // --- 图片模式 ---
            if (video) {
                video.style.display = 'none';
                if (video.srcObject) {
                    video.srcObject.getTracks().forEach(t => t.stop());
                    video.srcObject = null;
                }
            }
            
            if (!img) {
                img = document.createElement('img');
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                img.style.backgroundColor = '#000'; // 黑色背景，避免白边
                img.style.display = 'none'; // 默认隐藏，防止显示破损图标
                
                // 添加错误处理
                img.onerror = function() {
                    console.warn('Failed to load local image');
                    this.style.display = 'none';
                };
                
                // 添加加载成功处理
                img.onload = function() {
                    this.style.display = 'block';
                };
                
                container.appendChild(img);
            }
            if (imgSrc && imgSrc.length > 10) {
                img.src = imgSrc;
                // 不在这里设置 display，让 onload 处理
            } else {
                img.removeAttribute('src');
                img.style.display = 'none';
            }
        }
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
