(function (global) {
    const _registry = new Map();

    const TemplateRegistry = {
        register(name, rendererFn) {
            console.log(`[TemplateRegistry] Registered template: ${name}`);
            _registry.set(name, rendererFn);
        },
        get(name) {
            if (!_registry.has(name)) {
                console.warn(`[TemplateRegistry] No template found for: ${name}`);
                return null;
            }
            const renderer = _registry.get(name);
            console.log(`[TemplateRegistry][GET] template: ${name}`, renderer);
            return renderer;
        }
    };
    TemplateRegistry.register('experience', function renderExperience(items, section, contentDiv) {
        if (!items || items.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.style.cssText = 'text-align: center; padding: 40px; color: #666; font-style: italic;';
            emptyDiv.textContent = 'No items available.';
            contentDiv.appendChild(emptyDiv);
            return;
        }

        // ---------- 🔧 链接处理：Markdown + 纯URL + “文字：URL”，并避免破坏已有 <a> ----------
        const linkify = (text) => {
            if (!text) return '';

            let html = String(text);

            // ① 先把 Markdown 链接变成 <a>
            html = html.replace(
                /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
                (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
            );

            // ② 保护已有 <a>，避免后续替换命中其 href
            const anchors = [];
            html = html.replace(/<a\b[^>]*>.*?<\/a>/gi, (m) => {
                const key = `__A${anchors.length}__`;
                anchors.push(m);
                return key;
            });

            // ③ “文字：URL”
            html = html.replace(
                /(\S+?)[:：]\s*(https?:\/\/[^\s<>"')\]]+)/g,
                (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
            );

            // ④ 裸 URL
            html = html.replace(
                /(https?:\/\/[^\s<>"')\]]+)/g,
                (_, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
            );

            // ⑤ 还原占位的 <a>
            html = html.replace(/__A(\d+)__/g, (_, i) => anchors[Number(i)]);

            return html;
        };

        // ---------- 🧹 纯文本提取：用于测量列宽 ----------
        const stripForMeasure = (str) => {
            if (!str) return '';
            return String(str)
                // 去掉 Markdown 链接，保留文字
                .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
                // 去掉 HTML 标签
                .replace(/<[^>]*>/g, '')
                // “文字：URL”只保留文字
                .replace(/(\S+?)[:：]\s*(https?:\/\/[^\s<>"')\]]+)/g, '$1')
                // 去掉裸 URL
                .replace(/https?:\/\/[^\s<>"')\]]+/g, '');
        };

        // ---------- 1️⃣ 预计算列宽 ----------
        let maxDateWidth = 0, maxTitleWidth = 0, maxOrgWidth = 0;
        const temp = document.createElement('div');
        temp.style.cssText = 'position:absolute; visibility:hidden; white-space:nowrap; font-weight:bold; font-family:inherit;';
        document.body.appendChild(temp);
        const measureText = (text) => {
            temp.textContent = stripForMeasure(text || '');
            return temp.getBoundingClientRect().width;
        };

        items.forEach(entry => {
            const hasHeaderInfo = entry.date || entry.title || entry.org;
            if (hasHeaderInfo) {
                maxDateWidth = Math.max(maxDateWidth, measureText(entry.date));
                maxTitleWidth = Math.max(maxTitleWidth, measureText(entry.title));
                maxOrgWidth = Math.max(maxOrgWidth, measureText(entry.org));
            }
        });
        document.body.removeChild(temp);

        // ---------- 2️⃣ 渲染 ----------
        items.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'experience-item';
            div.style.cssText = 'margin: 8px 0; font-family: inherit; display: block; overflow: visible;';

            const date = entry.date || '';
            const title = entry.title || '';
            const orgHTML = linkify(entry.org || '');
            const content = entry.content || [];

            const isSubheadingOnly = (title && !date && !orgHTML && (!content || content.length === 0));

            if (isSubheadingOnly) {
                const heading = document.createElement('div');
                heading.className = 'experience-subheading';
                heading.style.cssText = `
                font-weight:bold;
                text-transform:uppercase;
                font-size:1.05em;
                margin:12px 0 4px 0;
            `;
                heading.textContent = title;
                div.appendChild(heading);
            } else {
                const header = document.createElement('div');
                header.className = 'experience-header';
                header.style.cssText = `
                margin-left: 2em;
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
                font-weight: bold;
                align-items: baseline;
            `;

                const dateSpan = document.createElement('span');
                dateSpan.className = 'exp-date';
                dateSpan.style.cssText = `min-width:${maxDateWidth}px; display:inline-block;`;
                dateSpan.textContent = date;

                const titleSpan = document.createElement('span');
                titleSpan.className = 'exp-title';
                titleSpan.style.cssText = `min-width:${maxTitleWidth}px; display:inline-block;`;
                titleSpan.textContent = title;

                const orgSpan = document.createElement('span');
                orgSpan.className = 'exp-org';
                orgSpan.style.cssText = `min-width:${maxOrgWidth}px; display:inline-block;`;
                orgSpan.innerHTML = orgHTML; // ← 允许渲染成真正的链接

                header.append(dateSpan, titleSpan, orgSpan);
                div.appendChild(header);

                if (Array.isArray(content) && content.length > 0) {
                    const totalOffset = maxDateWidth * 0.6;
                    const ul = document.createElement('ul');
                    ul.className = 'experience-content';
                    ul.style.cssText = `
                    display: block;
                    margin-left: ${totalOffset}px;
                    margin-top: 6px;
                    padding-left: 1.25em;
                    list-style-type: disc;
                    list-style-position: outside;
                    color: inherit;
                `;
                    content.forEach(point => {
                        const li = document.createElement('li');
                        li.innerHTML = linkify(point);
                        li.style.cssText = 'margin-bottom: 4px;';
                        ul.appendChild(li);
                    });
                    div.appendChild(ul);
                }
            }

            contentDiv.appendChild(div);
        });

        // ---------- 3️⃣ 样式 ----------
        const styleTagId = 'experience-responsive-style';
        if (!document.getElementById(styleTagId)) {
            const style = document.createElement('style');
            style.id = styleTagId;
            style.textContent = `
        /* ---------- 链接基础样式 ---------- */
        .experience-content a, .exp-org a {
            color: inherit; /* 继承正文颜色 */
            text-decoration: none;
            border-bottom: 1px dashed rgba(0, 0, 0, 0.4); /* 浅色虚线下划线 */
            transition: all 0.2s ease;
        }
        .experience-content a:hover, .exp-org a:hover {
            color: #007bff; /* 鼠标悬停时变蓝 */
            border-bottom: 1px solid #007bff; /* 实线下划线 */
        }

        /* ---------- 暗色模式适配 ---------- */
        body.dark-mode .experience-content a,
        body.dark-mode .exp-org a {
            border-bottom: 1px dashed rgba(255, 255, 255, 0.4); /* 白色虚线下划线 */
        }
        body.dark-mode .experience-content a:hover,
        body.dark-mode .exp-org a:hover {
            color: #66aaff; /* 淡蓝色悬停 */
            border-bottom: 1px solid #66aaff; /* 实线下划线 */
        }

        /* ---------- 窄屏适配 ---------- */
        @media (max-width: 768px) {
            .experience-header {
                flex-direction: column !important;
                align-items: flex-start !important;
                gap: 4px !important;
                margin-left: 1em !important;
            }
            .experience-content {
                margin-left: 2.5em !important;
                padding-left: 1.2em !important;
            }
        }`;

            document.head.appendChild(style);
        }
    });

    TemplateRegistry.register('experience', function renderExperience(items, section, contentDiv) {
        if (!items || items.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.style.cssText = 'text-align: center; padding: 40px; color: #666; font-style: italic;';
            emptyDiv.textContent = 'No items available.';
            contentDiv.appendChild(emptyDiv);
            return;
        }

        // ---------- 🔧 链接处理：Markdown + 纯URL + “文字：URL”，并避免破坏已有 <a> ----------
        const linkify = (text) => {
            if (!text) return '';

            let html = String(text);

            // ① 先把 Markdown 链接变成 <a>
            html = html.replace(
                /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
                (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
            );

            // ② 保护已有 <a>，避免后续替换命中其 href
            const anchors = [];
            html = html.replace(/<a\b[^>]*>.*?<\/a>/gi, (m) => {
                const key = `__A${anchors.length}__`;
                anchors.push(m);
                return key;
            });

            // ③ “文字：URL”
            html = html.replace(
                /(\S+?)[:：]\s*(https?:\/\/[^\s<>"')\]]+)/g,
                (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
            );

            // ④ 裸 URL
            html = html.replace(
                /(https?:\/\/[^\s<>"')\]]+)/g,
                (_, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
            );

            // ⑤ 还原占位的 <a>
            html = html.replace(/__A(\d+)__/g, (_, i) => anchors[Number(i)]);

            return html;
        };

        // ---------- 🧹 纯文本提取：用于测量列宽 ----------
        const stripForMeasure = (str) => {
            if (!str) return '';
            return String(str)
                // 去掉 Markdown 链接，保留文字
                .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
                // 去掉 HTML 标签
                .replace(/<[^>]*>/g, '')
                // “文字：URL”只保留文字
                .replace(/(\S+?)[:：]\s*(https?:\/\/[^\s<>"')\]]+)/g, '$1')
                // 去掉裸 URL
                .replace(/https?:\/\/[^\s<>"')\]]+/g, '');
        };

        // ---------- 1️⃣ 预计算列宽 ----------
        let maxDateWidth = 0, maxTitleWidth = 0, maxOrgWidth = 0;
        const temp = document.createElement('div');
        temp.style.cssText = 'position:absolute; visibility:hidden; white-space:nowrap; font-weight:bold; font-family:inherit;';
        document.body.appendChild(temp);
        const measureText = (text) => {
            temp.textContent = stripForMeasure(text || '');
            return temp.getBoundingClientRect().width;
        };

        items.forEach(entry => {
            const hasHeaderInfo = entry.date || entry.title || entry.org;
            if (hasHeaderInfo) {
                maxDateWidth = Math.max(maxDateWidth, measureText(entry.date));
                maxTitleWidth = Math.max(maxTitleWidth, measureText(entry.title));
                maxOrgWidth = Math.max(maxOrgWidth, measureText(entry.org));
            }
        });
        document.body.removeChild(temp);

        // ---------- 2️⃣ 渲染 ----------
        items.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'experience-item';
            div.style.cssText = 'margin: 8px 0; font-family: inherit; display: block; overflow: visible;';

            const date = entry.date || '';
            const title = entry.title || '';
            const orgHTML = linkify(entry.org || '');
            const content = entry.content || [];

            const isSubheadingOnly = (title && !date && !orgHTML && (!content || content.length === 0));

            if (isSubheadingOnly) {
                const heading = document.createElement('div');
                heading.className = 'experience-subheading';
                heading.style.cssText = `
                font-weight:bold;
                text-transform:uppercase;
                font-size:1.05em;
                margin:12px 0 4px 0;
            `;
                heading.textContent = title;
                div.appendChild(heading);
            } else {
                const header = document.createElement('div');
                header.className = 'experience-header';
                header.style.cssText = `
                margin-left: 2em;
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
                font-weight: bold;
                align-items: baseline;
            `;

                const dateSpan = document.createElement('span');
                dateSpan.className = 'exp-date';
                dateSpan.style.cssText = `min-width:${maxDateWidth}px; display:inline-block;`;
                dateSpan.textContent = date;

                const titleSpan = document.createElement('span');
                titleSpan.className = 'exp-title';
                titleSpan.style.cssText = `min-width:${maxTitleWidth}px; display:inline-block;`;
                titleSpan.textContent = title;

                const orgSpan = document.createElement('span');
                orgSpan.className = 'exp-org';
                orgSpan.style.cssText = `min-width:${maxOrgWidth}px; display:inline-block;`;
                orgSpan.innerHTML = orgHTML; // ← 允许渲染成真正的链接

                header.append(dateSpan, titleSpan, orgSpan);
                div.appendChild(header);

                if (Array.isArray(content) && content.length > 0) {
                    const totalOffset = maxDateWidth * 0.6;
                    const ul = document.createElement('ul');
                    ul.className = 'experience-content';
                    ul.style.cssText = `
                    display: block;
                    margin-left: ${totalOffset}px;
                    margin-top: 6px;
                    padding-left: 1.25em;
                    list-style-type: disc;
                    list-style-position: outside;
                    color: inherit;
                `;
                    content.forEach(point => {
                        const li = document.createElement('li');
                        li.innerHTML = linkify(point);
                        li.style.cssText = 'margin-bottom: 4px;';
                        ul.appendChild(li);
                    });
                    div.appendChild(ul);
                }
            }

            contentDiv.appendChild(div);
        });

        // ---------- 3️⃣ 样式 ----------
        const styleTagId = 'experience-responsive-style';
        if (!document.getElementById(styleTagId)) {
            const style = document.createElement('style');
            style.id = styleTagId;
            style.textContent = `
        .experience-content a, .exp-org a {
            color: inherit; /* 继承正文颜色 */
            text-decoration: none;
            border-bottom: 1px dashed rgba(0, 0, 0, 0.4); /* 浅色虚线下划线 */
            transition: all 0.2s ease;
        }
        .experience-content a:hover, .exp-org a:hover {
            color: #007bff; /* 鼠标悬停时变蓝 */
            border-bottom: 1px solid #007bff; /* 实线下划线 */
        }

        /* ---------- 暗色模式适配 ---------- */
        body.dark-mode .experience-content a,
        body.dark-mode .exp-org a {
            border-bottom: 1px dashed rgba(255, 255, 255, 0.4); /* 白色虚线下划线 */
        }
        body.dark-mode .experience-content a:hover,
        body.dark-mode .exp-org a:hover {
            color: #66aaff; /* 淡蓝色悬停 */
            border-bottom: 1px solid #66aaff; /* 实线下划线 */
        }

        /* ---------- 窄屏适配 ---------- */
        @media (max-width: 768px) {
            .experience-header {
                flex-direction: column !important;
                align-items: flex-start !important;
                gap: 4px !important;
                margin-left: 1em !important;
            }
            .experience-content {
                margin-left: 2.5em !important;
                padding-left: 1.2em !important;
            }
        }`;

            document.head.appendChild(style);
        }
    });



    global.TemplateRegistry = TemplateRegistry;
    console.log("[templates.js] global.TemplateRegistry assigned");
})(window);
