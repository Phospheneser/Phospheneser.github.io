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

        // ---------- 1️⃣ 预计算三列最大宽度 ----------
        let maxDateWidth = 0, maxTitleWidth = 0, maxOrgWidth = 0;
        const temp = document.createElement('div');
        temp.style.cssText = 'position:absolute; visibility:hidden; white-space:nowrap; font-weight:bold; font-family:inherit;';
        document.body.appendChild(temp);

        const measureText = text => {
            temp.textContent = text || '';
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

        console.log(`Column widths => date:${maxDateWidth}px, title:${maxTitleWidth}px, org:${maxOrgWidth}px`);

        // ---------- 2️⃣ 渲染 ----------
        items.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'experience-item';
            div.style.cssText = 'margin: 8px 0; font-family: inherit; display: block; overflow: visible;';

            const date = entry.date || '';
            const title = entry.title || '';
            const org = entry.org || '';
            const content = entry.content || [];

            // -------- 子小结标题逻辑 --------
            const isSubheadingOnly = (
                title &&
                !date && !org &&
                (!content || content.length === 0)
            );

            if (isSubheadingOnly) {
                const heading = document.createElement('div');
                heading.className = 'experience-subheading';
                heading.style.cssText = `
                font-weight: bold;
                text-transform: uppercase;
                font-size: 1.05em;
                margin: 12px 0 4px 0;
            `;
                heading.textContent = title;
                div.appendChild(heading);
            } else {
                // -------- 正常的三列条目 --------
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

                header.innerHTML = `
                <span class="exp-date" style="min-width:${maxDateWidth}px; display:inline-block;">${date}</span>
                <span class="exp-title" style="min-width:${maxTitleWidth}px; display:inline-block;">${title}</span>
                <span class="exp-org" style="min-width:${maxOrgWidth}px; display:inline-block;">${org}</span>
            `;
                div.appendChild(header);

                // -------- 内容部分 --------
                if (Array.isArray(content) && content.length > 0) {
                    const totalOffset =
                        maxDateWidth * 0.6; // date列 + gap（轻度缩进）

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
                        li.textContent = point;
                        li.style.cssText = 'margin-bottom: 4px;';
                        ul.appendChild(li);
                    });
                    div.appendChild(ul);
                }
            }

            contentDiv.appendChild(div);
        });

        // ---------- 3️⃣ 响应式 CSS ----------
        const styleTagId = 'experience-responsive-style';
        if (!document.getElementById(styleTagId)) {
            const style = document.createElement('style');
            style.id = styleTagId;
            style.textContent = `
        /* ---------- 桌面端 ---------- */
        .experience-header {
            flex-direction: row;
        }

        /* ---------- 窄屏模式 ---------- */
        @media (max-width: 768px) {
            .experience-header {
                flex-direction: column !important;
                align-items: flex-start !important;
                gap: 4px !important;
                margin-left: 1em !important;
            }
            .experience-header .exp-date {
                font-weight: 600;
                opacity: 0.9;
            }
            .experience-header .exp-title {
                margin-left: 0;
            }
            .experience-header .exp-org {
                margin-left: 0;
                font-weight: normal;
                opacity: 0.85;
            }
            .experience-content {
                margin-left: 2.5em !important;
                padding-left: 1.2em !important;
            }
        }
        `;
            document.head.appendChild(style);
        }
    });



    global.TemplateRegistry = TemplateRegistry;
    console.log("[templates.js] global.TemplateRegistry assigned");
})(window);
