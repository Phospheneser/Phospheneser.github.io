import { setImageSource } from '../core/images.js';
import { TemplateRegistry } from '../templates.js';
import { decorateLinkAnchor, isValidUrl, isExternalUrl, assetURL, blogURL } from '../core/links.js';
import { siteURL } from '../core/data.js';

export function createSectionRenderer(metaConfig, currentLang) {
  const BLOG_LABELS = {
    readMore: {
      en: 'Read more',
      zh: '阅读全文',
      jp: '続きを読む'
    },
    archive: {
      en: 'View all posts',
      zh: '查看全部文章',
      jp: 'すべての記事を見る'
    }
  };

  function drawList(list, section, contentDiv, sectionData) {
    if (!contentDiv) return;
    contentDiv.innerHTML = '';

    if (!Array.isArray(list) || list.length === 0) {
      const placeholder = (metaConfig && metaConfig.emptyStates && metaConfig.emptyStates[section.id]) || 'No records available.';
      const p = document.createElement('p');
      p.className = 'text-homepage-1';
      p.textContent = placeholder;
      contentDiv.appendChild(p);
      return;
    }

    const type = section.itemType || section.id;
    const template = getSectionTemplate(section, type);
    const customRenderer = TemplateRegistry.get(template);
    if (typeof customRenderer === 'function') {

      try {
        return customRenderer(list, section, contentDiv, { meta: metaConfig, language: currentLang });

      } catch (err) {
        console.error(`[TemplateRegistry][ERROR] Failed to render "${template}":`, err);
      }
    }
    list.forEach(entry => {
      const block = document.createElement('div');
      block.className = 'section-text-block';
      renderEntryByTemplate(block, entry, section, template, type);
      if (block.childElementCount > 0) {
        contentDiv.appendChild(block);
      }
    });

    if (type === 'blog' && templateSupportsArchive(template)) {
      appendBlogArchiveCallout(contentDiv, getSectionArchiveLabel(section, sectionData));
    }
  }

  function getSectionArchiveLabel(section, sectionData) {
    if (!sectionData) return '';
    if (typeof sectionData.archive_label === 'string') return sectionData.archive_label;
    if (sectionData.labels && typeof sectionData.labels.archive === 'string') return sectionData.labels.archive;
    if (sectionData.labels && typeof sectionData.labels.archive_label === 'string') return sectionData.labels.archive_label;
    return '';
  }

  function getSectionTemplate(section, type) {
    if (!section) return 'default';
    if (section.template) return section.template;
    const key = type || section.itemType || section.id;
    if (metaConfig && metaConfig.itemTypes && metaConfig.itemTypes[key] && metaConfig.itemTypes[key].template) {
      return metaConfig.itemTypes[key].template;
    }
    return 'default';
  }

  function templateSupportsArchive(template) {
    const name = (template || '').toLowerCase();
    return name === 'paper-card' || name === 'meta-card' || name === 'feature-card' || name === 'card';
  }

  function renderEntryByTemplate(block, entry, section, template, type) {
    appendSortMetadata(block, entry);
    const builtins = {
      'paper-card': renderMetaCard, 'meta-card': renderMetaCard,
      'feature-card': renderMetaCard, card: renderMetaCard,
      timeline: renderTimelineEntry, 'list-inline': renderListInlineEntry,
      default: renderGenericEntry
    };
    (builtins[template] || renderGenericEntry)(block, entry, type);
  }

  function renderListInlineEntry(block, entry) {
    const primary = entry && (entry.content || entry.title || entry.description);
    const line = formatStrongLine(entry && entry.date, primary);
    appendParagraph(block, line || primary || '');
  }

  function renderTimelineEntry(block, entry) {
    appendParagraph(block, formatTitleLine(entry && entry.title, entry && entry.org, entry && entry.date));
    appendParagraph(block, entry && entry.description);
  }

  function renderGenericEntry(block, entry, type) {
    const secondary = entry && (entry.org || entry.conference || entry.subtitle || entry.role || entry.location || '');
    appendParagraph(block, formatTitleLine(entry && entry.title, secondary, entry && entry.date));
    if (entry && entry.authors) appendParagraph(block, entry.authors);
    appendParagraph(block, entry && (entry.description || entry.summary || entry.content));
    appendLinks(block, entry ? entry.links : []);
  }

  function appendParagraph(block, text) {
    if (!text) return;
    const p = document.createElement('p');
    p.className = 'text-homepage-1';
    if (text instanceof Node) {
      p.appendChild(text);
    } else {
      p.innerHTML = text;
    }
    block.appendChild(p);
  }

  function appendLinks(block, links) {
    if (!Array.isArray(links) || links.length === 0) return;
    const p = document.createElement('p');
    p.className = 'text-homepage-1';
    links.forEach(link => {
      if (!link || !link.url) return;
      const anchor = document.createElement('a');
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      const label = link.type || link.label || 'Link';
      decorateLinkAnchor(anchor, link, label);
      const text = link.type ? `[${link.type}]` : (link.label ? `[${link.label}]` : '[Link]');
      anchor.appendChild(document.createTextNode(text));
      anchor.style.marginRight = '8px';
      anchor.classList.add('meta-inline-link');
      p.appendChild(anchor);
    });
    block.appendChild(p);
  }

  const CARD_DEFAULTS = {
    mediaField: 'image',
    titleField: 'title',
    subtitleFields: [],
    badgeField: '',
    badgeFields: [],
    badgeSeparator: ' · ',
    metaFields: [],
    descriptionFields: ['description', 'content'],
    detailsField: '',
    tagsField: 'tags',
    placeholderLabel: 'Media Placeholder',
    actions: [],
    primaryLink: { type: 'auto' }
  };

  function toArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  function getTemplateOptions(type) {
    const definition = (metaConfig && metaConfig.itemTypes && metaConfig.itemTypes[type]) || {};
    const opts = definition.templateOptions || {};
    return {
      mediaField: opts.mediaField !== undefined ? opts.mediaField : CARD_DEFAULTS.mediaField,
      titleField: opts.titleField !== undefined ? opts.titleField : CARD_DEFAULTS.titleField,
      subtitleFields: toArray(opts.subtitleFields !== undefined ? opts.subtitleFields : CARD_DEFAULTS.subtitleFields),
      badgeField: opts.badgeField !== undefined ? opts.badgeField : CARD_DEFAULTS.badgeField,
      badgeFields: toArray(opts.badgeFields !== undefined ? opts.badgeFields : CARD_DEFAULTS.badgeFields),
      badgeSeparator: opts.badgeSeparator !== undefined ? opts.badgeSeparator : CARD_DEFAULTS.badgeSeparator,
      metaFields: toArray(opts.metaFields !== undefined ? opts.metaFields : CARD_DEFAULTS.metaFields),
      descriptionFields: toArray(opts.descriptionFields !== undefined ? opts.descriptionFields : CARD_DEFAULTS.descriptionFields),
      detailsField: opts.detailsField !== undefined ? opts.detailsField : CARD_DEFAULTS.detailsField,
      tagsField: opts.tagsField !== undefined ? opts.tagsField : CARD_DEFAULTS.tagsField,
      placeholderLabel: opts.placeholderLabel !== undefined ? opts.placeholderLabel : CARD_DEFAULTS.placeholderLabel,
      actions: Array.isArray(opts.actions) ? opts.actions : CARD_DEFAULTS.actions,
      primaryLink: opts.primaryLink || CARD_DEFAULTS.primaryLink
    };
  }

  function readField(entry, path) {
    if (!entry || !path) return '';
    if (path === '@lang') return currentLang;
    if (typeof path !== 'string') return '';
    if (path.includes('.')) {
      return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : ''), entry) || '';
    }
    return entry[path] !== undefined ? entry[path] : '';
  }

  function readFirstField(entry, fields) {
    const list = toArray(fields);
    for (let i = 0; i < list.length; i++) {
      const value = readField(entry, list[i]);
      if (value) return value;
    }
    return '';
  }

  function getArrayField(entry, field) {
    if (!field) return [];
    const value = readField(entry, field);
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
  }

  function gatherMetaFields(entry, fields) {
    return toArray(fields).map(field => readField(entry, field)).filter(Boolean);
  }

  function gatherBadgeFields(entry, fields) {
    return toArray(fields).map(field => readField(entry, field)).filter(Boolean);
  }

  function buildTemplateUrl(template, entry) {
    if (!template) return '';
    return template.replace(/{{(.*?)}}/g, (_, token) => {
      const key = token.trim();
      if (key === '@lang') return currentLang;
      const value = readField(entry, key);
      return value || '';
    });
  }

  function resolvePrimaryLink(entry, type, options) {
    const cfg = options.primaryLink || CARD_DEFAULTS.primaryLink;
    if (!cfg || !cfg.type || cfg.type === 'auto') return resolveEntryUrl(entry);
    switch (cfg.type) {
      case 'field':
        return isValidUrl(readField(entry, cfg.field)) ? readField(entry, cfg.field) : '';
      case 'template':
        return buildTemplateUrl(cfg.template, entry);
      case 'blogSlug':
        return buildBlogUrl(entry);
      default:
        return resolveEntryUrl(entry);
    }
  }

  function renderMetaCard(block, entry, type) {
    if (!entry) return;
    const { data, options } = buildMetaCardData(entry, type);
    block.classList.add('meta-card', `meta-card--${type}`);

    const imageSrc = entry.hero_image ? new URL(entry.hero_image, siteURL('blogs/')).href : data.image || '';
    const media = createMediaSlot(imageSrc, data.title, options.placeholderLabel);
    if (media) block.appendChild(media);

    const content = document.createElement('div');
    content.className = 'meta-card-content';

    const header = document.createElement('div');
    header.className = 'blog-card-header meta-card-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'meta-card-title-row';
    const titleEl = createMetaCardTitle(data.title, data.url);
    titleRow.appendChild(titleEl);
    if (data.topRight) {
      const badge = document.createElement('span');
      badge.className = 'meta-card-top-right';
      badge.innerHTML = data.topRight;
      titleRow.appendChild(badge);
    }
    header.appendChild(titleRow);

    if (data.subtitle) {
      const subtitle = document.createElement('div');
      subtitle.className = 'meta-card-subtitle';
      subtitle.innerHTML = data.subtitle;
      header.appendChild(subtitle);
    }

    if (data.meta.length) {
      const meta = buildMetaLine(data.meta);
      if (meta) header.appendChild(meta);
    }

    content.appendChild(header);

    if (data.description) {
      const summary = document.createElement('p');
      summary.className = 'blog-summary meta-card-summary';
      summary.innerHTML = data.description;
      content.appendChild(summary);
    }

    if (data.details.length) {
      const list = document.createElement('ul');
      list.className = 'meta-card-list';
      data.details.forEach(item => {
        if (!item) return;
        const li = document.createElement('li');
        li.innerHTML = item;
        list.appendChild(li);
      });
      if (list.childElementCount) content.appendChild(list);
    }

    if (data.tags.length) {
      const tags = createTagList(data.tags);
      if (tags) {
        tags.classList.add('meta-card-tags');
        content.appendChild(tags);
      }
    }

    const actions = buildCardActions(entry, data, type, options);
    if (actions) content.appendChild(actions);

    block.appendChild(content);
  }

  function buildMetaCardData(entry, type) {
    const options = getTemplateOptions(type);
    const data = {
      title: readField(entry, options.titleField) || 'Untitled',
      subtitle: readFirstField(entry, options.subtitleFields),
      meta: gatherMetaFields(entry, options.metaFields),
      description: readFirstField(entry, options.descriptionFields),
      details: getArrayField(entry, options.detailsField),
      tags: getArrayField(entry, options.tagsField),
      url: resolvePrimaryLink(entry, type, options),
      image: readField(entry, options.mediaField),
      topRight: ''
    };

    const badgeValues = gatherBadgeFields(entry, options.badgeFields);
    if (badgeValues.length) {
      const separator = options.badgeSeparator || CARD_DEFAULTS.badgeSeparator;
      data.topRight = badgeValues.join(separator);
    } else if (options.badgeField) {
      data.topRight = readField(entry, options.badgeField);
    }

    return { data, options };
  }

  function createMetaCardTitle(title, url) {
    const isLink = isValidUrl(url);
    const element = document.createElement(isLink ? 'a' : 'span');
    element.className = 'blog-card-title meta-card-title';
    element.innerHTML = title || 'Untitled';
    if (isLink) {
      element.href = url;
      if (isExternalUrl(url)) {
        element.target = '_blank';
        element.rel = 'noopener noreferrer';
      }
    }
    return element;
  }

  function buildMetaLine(values) {
    const filtered = values.filter(Boolean);
    if (!filtered.length) return null;
    const meta = document.createElement('div');
    meta.className = 'blog-meta meta-card-meta';
    filtered.forEach(text => {
      const span = document.createElement('span');
      span.className = 'meta-card-meta-item';
      span.innerHTML = text;
      meta.appendChild(span);
    });
    return meta;
  }

  function buildCardActions(entry, data, type, options) {
    const extraLinks = buildExtraLinks(entry, data.url);
    const actionsConfig = Array.isArray(options.actions) ? options.actions : [];
    if (!extraLinks.length && !actionsConfig.length) return null;
    const container = document.createElement('div');
    container.className = 'blog-actions meta-card-actions';

    extraLinks.forEach(link => {
      link.classList.add('meta-card-extra-link');
      container.appendChild(link);
    });

    actionsConfig.forEach(action => {
      if (!action || !action.type) return;
      switch (action.type) {
        case 'readMore': {
          const url = data.url || resolvePrimaryLink(entry, type, options);
          if (!isValidUrl(url)) break;
          const readMore = document.createElement('a');
          readMore.className = 'blog-read-more meta-card-read-more';
          readMore.href = url;
          const label = resolveActionLabel(action.label) || entry && entry.read_more_label || getBlogReadMoreLabel();
          readMore.innerHTML = `<span>${label}</span><i class="fas fa-arrow-right"></i>`;
          container.appendChild(readMore);
          break;
        }
        default:
          break;
      }
    });

    return container.childElementCount ? container : null;
  }

  function resolveActionLabel(labelConfig) {
    if (!labelConfig) return '';
    if (typeof labelConfig === 'string') return labelConfig;
    if (typeof labelConfig === 'object') {
      return labelConfig[currentLang] || labelConfig.en || '';
    }
    return '';
  }

  function buildExtraLinks(entry, primaryUrl) {
    if (!entry || !Array.isArray(entry.links)) return [];
    const seen = new Set();
    const primary = typeof primaryUrl === 'string' ? primaryUrl.trim() : '';
    return entry.links.reduce((acc, link) => {
      if (!link || !link.url || !isValidUrl(link.url)) return acc;
      const url = link.url.trim();
      if (!url || seen.has(url)) return acc;
      seen.add(url);
      const anchor = document.createElement('a');
      anchor.className = 'blog-extra-link';
      anchor.href = url;
      const label = link.type || link.label || url;
      decorateLinkAnchor(anchor, link, label);
      anchor.appendChild(document.createTextNode(label));
      if (link.external === false) {
        anchor.target = '_self';
      } else if (isExternalUrl(url)) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      } else {
        anchor.target = '_self';
      }
      if (primary && url === primary) {
        anchor.classList.add('meta-card-extra-link--primary');
      }
      anchor.classList.add('meta-link');
      acc.push(anchor);
      return acc;
    }, []);
  }

  function resolveEntryUrl(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const direct = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (isValidUrl(direct)) return direct;
    if (Array.isArray(entry.links)) {
      const candidate = entry.links.find(link => link && typeof link.url === 'string' && isValidUrl(link.url));
      if (candidate) return candidate.url.trim();
    }
    return '';
  }

  function appendBlogArchiveCallout(container, label) {
    if (!container || container.querySelector('.blog-archive-callout')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'blog-archive-callout';
    const link = document.createElement('a');
    link.className = 'blog-archive-link blog-read-more';
    link.href = siteURL(`blogs/index.html?lang=${currentLang}`);
    const text = label || getBlogArchiveLabel();
    link.innerHTML = `<span>${text}</span><i class="fas fa-arrow-right"></i>`;
    wrapper.appendChild(link);
    container.appendChild(wrapper);
  }

  function buildBlogUrl(entry, lang = currentLang) { return blogURL(entry, lang); }

  function createTagList(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return null;
    const wrapper = document.createElement('div');
    wrapper.className = 'blog-tags';
    tags.forEach(tag => {
      if (!tag) return;
      const span = document.createElement('span');
      span.className = 'blog-tag meta-card-tag';
      span.innerHTML = tag;
      wrapper.appendChild(span);
    });
    return wrapper;
  }

  function getBlogReadMoreLabel(lang = currentLang) {
    const labels = BLOG_LABELS.readMore || {};
    return labels[lang] || labels.en || 'Read more';
  }

  function getBlogArchiveLabel(lang = currentLang) {
    const labels = BLOG_LABELS.archive || {};
    return labels[lang] || labels.en || 'View all posts';
  }

  function createMediaSlot(src, title, placeholderLabel = 'Media Placeholder') {
    const wrapper = document.createElement('div');
    wrapper.className = 'meta-card-media';
    const hasImage = typeof src === 'string' && src.trim();
    if (!hasImage) return null;
    if (hasImage) {
      const img = document.createElement('img');
      setImageSource(img, src);
      img.alt = title || 'Preview';
      img.loading = 'lazy';
      img.decoding = 'async';
      wrapper.appendChild(img);
    } else {
      wrapper.classList.add('meta-card-media--placeholder');
      const span = document.createElement('span');
      span.textContent = placeholderLabel || 'Media Placeholder';
      wrapper.appendChild(span);
    }
    return wrapper;
  }

  function appendSortMetadata(block, entry) {
    if (!entry || typeof entry !== 'object') return;
    if (entry.date) {
      block.dataset.sortDate = entry.date;
      const dateMarker = document.createElement('span');
      dateMarker.dataset.sortDate = entry.date;
      dateMarker.style.display = 'none';
      dateMarker.textContent = entry.date;
      block.appendChild(dateMarker);
    }
    if (entry.title) {
      block.dataset.sortTitle = entry.title;
      const titleMarker = document.createElement('span');
      titleMarker.dataset.sortTitle = entry.title;
      titleMarker.style.display = 'none';
      titleMarker.textContent = entry.title;
      block.appendChild(titleMarker);
    }
  }

  function formatTitleLine(title, secondary, prefix) {
    const parts = [];
    if (title) {
      parts.push(`<strong>${title}</strong>`);
    }
    if (secondary) {
      parts.push(secondary);
    }
    if (prefix) {
      parts.unshift(prefix);
    }
    return parts.join(' · ');
  }

  function formatStrongLine(primary, text) {
    if (!primary && !text) return '';
    if (!primary) return text || '';
    if (!text) return `<strong>${primary}</strong>`;
    return `<strong>${primary}</strong> ${text}`;
  }

  function stringifyEntry(entry) {
    try {
      return JSON.stringify(entry);
    } catch (e) {
      return '';
    }
  }

  return { drawList, renderMetaCard };
}
