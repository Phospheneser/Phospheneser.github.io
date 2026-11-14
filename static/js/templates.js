import { setImageSource } from './core/images.js';
import { linkify } from './core/links.js';

const registry = new Map();
export const TemplateRegistry = {
  register(name, render) {
    if (registry.has(name)) throw new Error(`Template already registered: ${name}`);
    if (typeof render !== 'function') throw new TypeError('A template must be a function');
    registry.set(name, render);
  },
  get(name) { return registry.get(name); }
};

TemplateRegistry.register('experience', (items, section, container) => {
  for (const entry of items) {
    const item = document.createElement('div'); item.className = 'experience-item';
    if (entry.title && !entry.date && !entry.org && !entry.content?.length) {
      const heading = document.createElement('h2'); heading.className = 'experience-subheading';
      heading.textContent = entry.title; item.appendChild(heading);
    } else {
      const header = document.createElement('div'); header.className = 'experience-header';
      for (const [field, className] of [['date', 'exp-date'], ['title', 'exp-title'], ['org', 'exp-org']]) {
        const span = document.createElement('span'); span.className = className;
        if (field === 'org') span.appendChild(linkify(entry[field]));
        else span.textContent = entry[field] || '';
        header.appendChild(span);
      }
      item.appendChild(header);
      const content = entry.content || (entry.description ? [entry.description] : []);
      if (content.length) {
        const list = document.createElement('ul'); list.className = 'experience-content';
        for (const text of Array.isArray(content) ? content : [content]) {
          const li = document.createElement('li'); li.appendChild(linkify(text)); list.appendChild(li);
        }
        item.appendChild(list);
      }
    }
    container.appendChild(item);
  }
});

TemplateRegistry.register('member-card', function renderMembers(items, section, contentDiv) {
    if (!contentDiv) return;
    contentDiv.innerHTML = '';
    const intro = contentDiv.dataset.sectionIntro || '';
    if (intro) {
        const introP = document.createElement('p');
        introP.className = 'text-homepage-1 member-intro';
        introP.textContent = intro;
        contentDiv.appendChild(introP);
    }

    if (!items || items.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.textContent = 'No interns on duty (yet).';
        contentDiv.appendChild(emptyDiv);
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'member-grid';

    items.forEach(member => {
        const card = document.createElement('div');
        card.className = 'member-card';

        if (member.image) {
            const avatar = document.createElement('img');
            avatar.className = 'member-avatar';
            setImageSource(avatar, member.image, { sizes: '84px', maxWidth: 320 });
            avatar.alt = member.name || '';
            avatar.loading = 'lazy';
            avatar.decoding = 'async';
            avatar.width = 84; avatar.height = 84;
            card.appendChild(avatar);
        }

        const name = document.createElement('div');
        name.className = 'member-name';
        name.textContent = member.name || 'Unnamed';

        const role = document.createElement('div');
        role.className = 'member-role';
        role.textContent = member.role || '';

        const focus = document.createElement('p');
        focus.className = 'member-focus';
        focus.textContent = member.focus || '';

        card.append(name, role);
        if (member.focus) card.appendChild(focus);

        if (Array.isArray(member.responsibilities) && member.responsibilities.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'member-resp';
            member.responsibilities.forEach(task => {
                const li = document.createElement('li');
                li.textContent = task;
                ul.appendChild(li);
            });
            card.appendChild(ul);
        }

        grid.appendChild(card);
    });

    contentDiv.appendChild(grid);
});

TemplateRegistry.register('visitor-globe', function renderVisitorGlobe(items, section, contentDiv) {
    if (!contentDiv) return;
    while (contentDiv.firstChild) contentDiv.removeChild(contentDiv.firstChild);

    const intro = contentDiv.dataset.sectionIntro || '';
    if (intro) {
        const introP = document.createElement('p');
        introP.className = 'text-homepage-1 visitor-intro';
        introP.textContent = intro;
        contentDiv.appendChild(introP);
    }

    const shell = document.createElement('div');
    shell.className = 'visitor-globe-shell';
    shell.setAttribute('aria-live', 'polite');
    contentDiv.appendChild(shell);

    const fallback = document.createElement('div');
    fallback.className = 'visitor-fallback';
    const item = items[0] || {};
    const link = document.createElement('a');
    link.href = item.url || 'https://mapmyvisitors.com';
    const image = document.createElement('img');
    image.src = item.image || '';
    image.alt = item.label || 'Visitor map';
    image.loading = 'lazy';
    image.decoding = 'async';
    link.appendChild(image);
    fallback.appendChild(link);
    shell.appendChild(fallback);

});
