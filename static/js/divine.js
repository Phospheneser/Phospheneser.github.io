import { divinationCopy } from './core/divination-copy.js';
import { createScope } from './core/lifecycle.js';
import { siteURL } from './core/data.js';
import { requestDivination, resolveDivineServer } from './core/divination.js';
import { serviceWarmup } from './core/service-warmup.js';

// 占卜小人功能实现
export class Diviner {
  constructor(meta = {}, { language = 'zh' } = {}) {
    this.language = language;
    this.meta = meta;
    this.lifecycle = createScope();
    this.container = null;
    this.divineWindow = null;
    this.divineMode = 'JiuGongLiuRen'; // 默认占卜模式
    this.query = this.copy.defaultQuery; // 默认查询
    this.isDragging = false;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  get copy() { return divinationCopy(this.language); }

  label(element, key) {
    element.dataset.divineCopy = key;
    element.textContent = this.copy[key];
  }

  setLanguage(language) {
    if (this.language === language) return;
    const oldDefault = this.copy.defaultQuery;
    this.language = language;
    this.container?.setAttribute('aria-label', this.copy.open);
    if (this.query === oldDefault) {
      this.query = this.copy.defaultQuery;
      const input = this.divineWindow?.querySelector('#divine-query');
      if (input) input.value = this.query;
    }
    this.divineWindow?.querySelectorAll('[data-divine-copy]').forEach(el => this.label(el, el.dataset.divineCopy));
    this.divineWindow?.querySelector('#divine-close-btn')?.setAttribute('aria-label', this.copy.close);
  }

  // 初始化占卜小人
  init() {
    // 创建占卜小人容器
    this.container = document.createElement('button');
    this.container.type = 'button';
    this.container.setAttribute('aria-label', this.copy.open);
    this.container.style.border = '0';
    this.container.style.padding = '0';
    this.container.style.background = 'transparent';
    this.container.style.touchAction = 'none';
    this.container.id = 'diviner-container';
    this.container.className = 'diviner-container';
    this.container.style.position = 'fixed';
    this.container.style.bottom = '80px';
    this.container.style.right = '20px';
    this.container.style.zIndex = '1001';
    this.container.style.cursor = 'pointer';
    this.container.style.transition = 'transform 0.3s ease';

    // 添加占卜小人图标
    const divinerIcon = document.createElement('img');
    divinerIcon.src = siteURL('media/divine/fortuneteller.svg');
    divinerIcon.alt = '';
    divinerIcon.draggable = false;
    divinerIcon.style.width = '60px';
    divinerIcon.style.height = '60px';
    this.container.appendChild(divinerIcon);

    // 添加悬停效果
    this.container.addEventListener('mouseover', () => {
      this.container.style.transform = 'scale(1.1)';
    });
    this.container.addEventListener('mouseout', () => {
      this.container.style.transform = 'scale(1)';
    });

    // 添加点击事件，打开占卜窗口
    this.container.addEventListener('click', () => {
      if (Date.now() >= (this.suppressClickUntil || 0)) this.openDivineWindow();
    });

    // A small pointer movement is still a click; actual dragging must not open
    // the panel. Pointer capture supports mouse, touch and pen consistently.
    this.lifecycle.on(this.container, 'pointerdown', event => {
      if (event.button !== 0 || event.isPrimary === false) return;
      const rect = this.container.getBoundingClientRect();
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
        left: rect.left, top: rect.top, width: rect.width, height: rect.height, moved: false };
      this.suppressClickUntil = 0;
      this.container.setPointerCapture?.(event.pointerId);
    });
    this.lifecycle.on(this.container, 'pointermove', event => {
      const drag = this.drag;
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      this.container.style.left = Math.max(0, Math.min(drag.left + dx, window.innerWidth - drag.width)) + 'px';
      this.container.style.top = Math.max(0, Math.min(drag.top + dy, window.innerHeight - drag.height)) + 'px';
      this.container.style.bottom = 'auto'; this.container.style.right = 'auto';
    });
    const endDrag = event => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      if (this.drag.moved || event.type === 'pointercancel') this.suppressClickUntil = Date.now() + 300;
      this.drag = null;
    };
    this.lifecycle.on(this.container, 'pointerup', endDrag);
    this.lifecycle.on(this.container, 'pointercancel', endDrag);
    this.lifecycle.on(this.container, 'lostpointercapture', endDrag);

    // 添加到页面
    document.body.appendChild(this.container);
  }

  // 打开占卜窗口
  openDivineWindow() {
    if (this.divineWindow) {
      return;
    }

    // 创建占卜窗口
    this.divineWindow = document.createElement('div');
    this.divineWindow.id = 'divine-window';
    this.divineWindow.className = 'divine-window';
    this.divineWindow.style.position = 'fixed';
    this.divineWindow.style.bottom = '80px';
    this.divineWindow.style.right = '20px';
    this.divineWindow.style.width = '350px';
    this.divineWindow.style.maxHeight = '50vh'; // 最大高度为屏幕高度的50%，确保顶部不超过屏幕中央
    this.divineWindow.style.maxWidth = '90vw'; // 确保在小屏幕上不会太宽
    // 设置基础样式，后续会根据暗色模式调整
    this.divineWindow.style.borderRadius = '10px';
    this.divineWindow.style.padding = '20px';
    this.divineWindow.style.zIndex = '1002';
    this.divineWindow.style.overflow = 'auto';
    this.divineWindow.style.fontFamily = 'Noto Sans, sans-serif';
    
    // 初始化样式（亮色模式）
    this.divineWindow.style.backgroundColor = 'white';
    this.divineWindow.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';
    
    // 检查是否为暗色模式并应用相应样式
    this.updateDarkModeStyles();

    // 添加关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.innerText = '×';
    closeBtn.id = 'divine-close-btn';
    closeBtn.setAttribute('aria-label', this.copy.close);
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '10px';
    closeBtn.style.right = '10px';
    closeBtn.style.width = '30px';
    closeBtn.style.height = '30px';
    closeBtn.style.border = 'none';
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.color = '#666';
    closeBtn.style.transition = 'color 0.3s ease';
    closeBtn.addEventListener('click', () => {
      this.closeDivineWindow();
    });
    // 悬停效果
    closeBtn.addEventListener('mouseover', () => {
      closeBtn.style.color = document.body.classList.contains('dark-mode') ? '#ffffff' : '#333';
    });
    closeBtn.addEventListener('mouseout', () => {
      closeBtn.style.color = document.body.classList.contains('dark-mode') ? '#aaa' : '#666';
    });
    this.divineWindow.appendChild(closeBtn);

    // 添加标题
    const title = document.createElement('h3');
    this.label(title, 'title');
    title.style.textAlign = 'center';
    title.style.color = document.body.classList.contains('dark-mode') ? '#e0e0e0' : '#363636';
    title.style.marginBottom = '20px';
    title.style.fontFamily = 'Google Sans, sans-serif';
    title.style.fontSize = '24px';
    this.divineWindow.appendChild(title);

    const serviceStatus = document.createElement('p');
    serviceStatus.id = 'divine-service-status';
    serviceStatus.setAttribute('role', 'status');
    serviceStatus.style.fontSize = '13px';
    serviceStatus.style.marginBottom = '12px';
    this.divineWindow.appendChild(serviceStatus);
    if (this.meta.divine?.prewarm !== false) {
      const serverUrl = resolveDivineServer(this.meta);
      this.label(serviceStatus, serviceWarmup.isReady(serverUrl) ? 'ready' : 'warming');
      void serviceWarmup.ensure(serverUrl).then(ready => {
        if (serviceStatus.isConnected) this.label(serviceStatus, ready ? 'ready' : 'notReady');
      });
    }

    // 添加查询输入
    const queryLabel = document.createElement('label');
    this.label(queryLabel, 'query');
    queryLabel.htmlFor = 'divine-query';
    queryLabel.style.display = 'block';
    queryLabel.style.marginBottom = '10px';
    queryLabel.style.color = document.body.classList.contains('dark-mode') ? '#e0e0e0' : '#333';
    this.divineWindow.appendChild(queryLabel);

    const queryInput = document.createElement('input');
    queryInput.type = 'text';
    queryInput.maxLength = 1000;
    queryInput.id = 'divine-query';
    queryInput.value = this.query;
    queryInput.style.width = '100%';
    queryInput.style.padding = '8px';
    queryInput.style.marginBottom = '15px';
    queryInput.style.border = document.body.classList.contains('dark-mode') ? '1px solid #555' : '1px solid #ddd';
    queryInput.style.borderRadius = '5px';
    queryInput.style.backgroundColor = document.body.classList.contains('dark-mode') ? '#4a4a4a' : 'white';
    queryInput.style.color = document.body.classList.contains('dark-mode') ? '#ffffff' : '#333';
    queryInput.style.transition = 'all 0.3s ease';
    queryInput.addEventListener('input', () => {
      this.query = queryInput.value;
    });
    this.divineWindow.appendChild(queryInput);

    // 添加占卜模式选择
    const modeLabel = document.createElement('label');
    this.label(modeLabel, 'mode');
    modeLabel.style.display = 'block';
    modeLabel.style.marginBottom = '10px';
    modeLabel.style.color = document.body.classList.contains('dark-mode') ? '#e0e0e0' : '#333';
    this.divineWindow.appendChild(modeLabel);

    const modeContainer = document.createElement('div');
    modeContainer.style.marginBottom = '15px';

    const modes = [
      { id: 'JiuGongLiuRen', name: '九宫六壬' },
      { id: 'LiuYaoQiGua', name: '六爻起卦' },
      { id: 'Tarot', name: '塔罗牌' }
    ];

    modes.forEach(mode => {
      const modeOption = document.createElement('div');
      modeOption.style.marginBottom = '5px';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.id = `mode-${mode.id}`;
      radio.name = 'divine-mode';
      radio.value = mode.id;
      radio.checked = mode.id === this.divineMode;
      radio.addEventListener('change', () => {
        this.divineMode = mode.id;
      });

      const modeLabel = document.createElement('label');
      modeLabel.htmlFor = `mode-${mode.id}`;
      this.label(modeLabel, mode.id);
      modeLabel.style.marginLeft = '5px';
      modeLabel.style.cursor = 'pointer';
      modeLabel.style.color = document.body.classList.contains('dark-mode') ? '#e0e0e0' : '#333';

      modeOption.appendChild(radio);
      modeOption.appendChild(modeLabel);
      modeContainer.appendChild(modeOption);
    });

    this.divineWindow.appendChild(modeContainer);

    const llmLabel = document.createElement('label');
    const llmInput = document.createElement('input');
    llmInput.type = 'checkbox'; llmInput.id = 'divine-use-llm';
    llmInput.checked = this.meta.divine?.useLLM === true;
    const llmText = document.createElement('span');
    this.label(llmText, 'ai');
    llmLabel.append(llmInput, document.createTextNode(' '), llmText);
    llmLabel.style.display = 'block'; llmLabel.style.marginBottom = '15px';
    this.divineWindow.appendChild(llmLabel);

    // 添加占卜按钮
    const divineBtn = document.createElement('button');
    divineBtn.id = 'divine-submit';
    this.label(divineBtn, 'submit');
    divineBtn.style.width = '100%';
    divineBtn.style.padding = '10px';
    divineBtn.style.backgroundColor = document.body.classList.contains('dark-mode') ? '#4a4a4a' : '#f5f5f5';
    divineBtn.style.color = document.body.classList.contains('dark-mode') ? '#ffffff' : '#363636';
    divineBtn.style.border = document.body.classList.contains('dark-mode') ? '1px solid #666' : '1px solid #ddd';
    divineBtn.style.borderRadius = '5px';
    divineBtn.style.cursor = 'pointer';
    divineBtn.style.fontSize = '16px';
    divineBtn.style.transition = 'all 0.3s ease';
    divineBtn.addEventListener('mouseover', () => {
      divineBtn.style.backgroundColor = document.body.classList.contains('dark-mode') ? '#666666' : '#e0e0e0';
    });
    divineBtn.addEventListener('mouseout', () => {
      divineBtn.style.backgroundColor = document.body.classList.contains('dark-mode') ? '#4a4a4a' : '#f5f5f5';
    });
    divineBtn.addEventListener('click', () => {
      this.startDivination();
    });
    this.divineWindow.appendChild(divineBtn);

    // 添加结果区域
    const resultContainer = document.createElement('div');
    resultContainer.id = 'divine-result';
    resultContainer.setAttribute('role', 'status');
    resultContainer.setAttribute('aria-live', 'polite');
    resultContainer.style.marginTop = '20px';
    resultContainer.style.padding = '15px';
    resultContainer.style.backgroundColor = document.body.classList.contains('dark-mode') ? 'rgba(50, 50, 50, 0.9)' : '#f9f9f9';
    resultContainer.style.borderRadius = '5px';
    resultContainer.style.minHeight = '100px';
    resultContainer.style.whiteSpace = 'pre-wrap';
    resultContainer.style.fontFamily = 'Noto Sans, sans-serif';
    resultContainer.style.color = document.body.classList.contains('dark-mode') ? '#e0e0e0' : '#333';
    resultContainer.style.border = document.body.classList.contains('dark-mode') ? '1px solid #555' : '1px solid #ddd';
    this.divineWindow.appendChild(resultContainer);

    // 添加入场动画
    this.divineWindow.style.opacity = '0';
    this.divineWindow.style.transform = 'scale(0.9)';
    this.divineWindow.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    
    // 添加到页面
    document.body.appendChild(this.divineWindow);
    
    // 触发重排后执行动画
    this.windowTimer = setTimeout(() => {
      if (!this.divineWindow) return;
      this.divineWindow.style.opacity = '1';
      this.divineWindow.style.transform = 'scale(1)';
    }, 10);
    
    // 监听暗色模式切换
    this.setupDarkModeListener();
  }
  
  // 设置暗色模式监听器
  setupDarkModeListener() {
    this.themeObserver?.disconnect();
    const observer = this.themeObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.attributeName === 'class' && document.body.classList.contains('dark-mode') !== this.wasDarkMode) {
          this.updateDarkModeStyles();
          this.wasDarkMode = document.body.classList.contains('dark-mode');
        }
      });
    });
    
    // 存储当前模式状态
    this.wasDarkMode = document.body.classList.contains('dark-mode');
    
    // 观察body的class变化
    observer.observe(document.body, {
      attributes: true
    });
    
    // 当窗口关闭时断开观察器

  }

  // 关闭占卜窗口
  closeDivineWindow() {
    this.requestController?.abort();
    this.requestController = null;
    clearTimeout(this.slowTimer);
    this.themeObserver?.disconnect();
    clearTimeout(this.windowTimer);
    this.divineWindow?.remove();
    this.divineWindow = null;
  }

  destroy() {
    this.closeDivineWindow();
    this.lifecycle.destroy();
    this.requestController?.abort();
    this.container?.remove();
  }

  updateDarkModeStyles() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    
    // 更新窗口样式
    this.divineWindow.style.backgroundColor = isDarkMode ? 'rgba(50, 50, 50, 0.95)' : 'white';
    this.divineWindow.style.boxShadow = isDarkMode ? '0 4px 20px rgba(0, 0, 0, 0.5)' : '0 4px 20px rgba(0, 0, 0, 0.2)';
    
    // 更新标题样式
    const title = this.divineWindow.querySelector('h3');
    if (title) {
      title.style.color = isDarkMode ? '#e0e0e0' : '#363636';
    }
    
    // 更新标签样式
    const labels = this.divineWindow.querySelectorAll('label');
    labels.forEach(label => {
      label.style.color = isDarkMode ? '#e0e0e0' : '#333';
    });
    
    // 更新输入框样式
    const queryInput = this.divineWindow.querySelector('#divine-query');
    if (queryInput) {
      queryInput.style.border = isDarkMode ? '1px solid #555' : '1px solid #ddd';
      queryInput.style.backgroundColor = isDarkMode ? '#4a4a4a' : 'white';
      queryInput.style.color = isDarkMode ? '#ffffff' : '#333';
    }
    
    // 更新结果区域样式
    const resultContainer = this.divineWindow.querySelector('#divine-result');
    if (resultContainer) {
      resultContainer.style.backgroundColor = isDarkMode ? 'rgba(50, 50, 50, 0.9)' : '#f9f9f9';
      resultContainer.style.color = isDarkMode ? '#e0e0e0' : '#333';
      resultContainer.style.border = isDarkMode ? '1px solid #555' : '1px solid #ddd';
    }
    
    // 更新关闭按钮样式
    const closeBtn = this.divineWindow.querySelector('#divine-close-btn');
    if (closeBtn) {
      closeBtn.style.color = isDarkMode ? '#aaa' : '#666';
    }
    
    // 更新占卜按钮样式
    const divineBtn = this.divineWindow.querySelector('button:not(#divine-close-btn)');
    if (divineBtn) {
      divineBtn.style.backgroundColor = isDarkMode ? '#4a4a4a' : '#f5f5f5';
      divineBtn.style.color = isDarkMode ? '#ffffff' : '#363636';
      divineBtn.style.border = isDarkMode ? '1px solid #666' : '1px solid #ddd';
    }
  }

  async startDivination() {
    const panel = this.divineWindow;
    if (!panel || this.requestController) return;
    const result = panel.querySelector('#divine-result');
    const query = panel.querySelector('#divine-query').value.trim();
    if (!query) { this.label(result, 'queryRequired'); return; }
    const button = panel.querySelector('#divine-submit');
    const controller = this.requestController = new AbortController();
    const current = () => this.requestController === controller && this.divineWindow === panel;
    button.disabled = true; this.label(button, 'submitting');
    this.label(result, 'connecting');
    result.setAttribute('aria-busy', 'true');
    this.slowTimer = setTimeout(() => {
      if (current()) this.label(result, 'slow');
    }, 8000);
    try {
      const serverUrl = resolveDivineServer(this.meta);
      const output = await requestDivination({ serverUrl, type: this.divineMode, query,
        useLLM: panel.querySelector('#divine-use-llm').checked, signal: controller.signal, language: this.language });
      serviceWarmup.noteReady(serverUrl);
      if (current()) {
        delete result.dataset.divineCopy;
        result.textContent = output;
        this.label(panel.querySelector('#divine-service-status'), 'ready');
      }
    } catch (error) {
      if (current() && error.name !== 'AbortError') { delete result.dataset.divineCopy; result.textContent = error.message; }
    } finally {
      if (current()) {
        clearTimeout(this.slowTimer);
        this.requestController = null;
        button.disabled = false; this.label(button, 'submit');
        result.removeAttribute('aria-busy');
      }
    }
  }
}

// The caller awaits config before initializing this optional feature.
export function initDiviner(meta, options) {
  if (meta.add_diviner === false) return null;
  const diviner = new Diviner(meta, options);
  diviner.init();
  return diviner;
}
