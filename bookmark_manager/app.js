/* global $ */
'use strict';

// ══════════════════════════════════════════════════════════════════
//  utils
// ══════════════════════════════════════════════════════════════════
const utils = {};

utils.copy = text => navigator.clipboard.writeText(text).catch(() => {
  document.oncopy = event => {
    event.clipboardData.setData('Text', text);
    event.preventDefault();
  };
  document.execCommand('Copy');
  document.oncopy = undefined;
});

utils.pageIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b93a8' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9.5'/%3E%3Cpath d='M2.5 12h19'/%3E%3Cpath d='M12 2.5a14.5 14.5 0 0 1 3.8 9.5 14.5 14.5 0 0 1-3.8 9.5 14.5 14.5 0 0 1-3.8-9.5A14.5 14.5 0 0 1 12 2.5z'/%3E%3C/svg%3E";

utils.favicon = (() => {
  const isFirefox = navigator.userAgent.indexOf('Firefox') !== -1;
  return url => {
    if (url.startsWith('/')) return url;
    if (url.startsWith('about:') || url.startsWith('chrome') || url.startsWith('moz')) {
      return utils.pageIcon;
    }
    if (isFirefox) {
      if (localStorage.getItem('resolve') === 'true') {
        return 'http://www.google.com/s2/favicons?domain_url=' + url;
      }
      return utils.pageIcon;
    }
    return chrome.runtime.getURL('/_favicon?') +
      'pageUrl=' + encodeURIComponent(url) + '&size=48';
  };
})();

// ══════════════════════════════════════════════════════════════════
//  notify
// ══════════════════════════════════════════════════════════════════
const notify = (function() {
  const div = document.getElementById('notification');
  const p = div.querySelector('span');
  let callback;

  div.querySelector('[data-cmd=yes]').addEventListener('click', () => {
    div.style.display = 'none';
    if (callback) { callback(true); callback = ''; }
  });
  div.querySelector('[data-cmd=no]').addEventListener('click', () => {
    div.style.display = 'none';
    if (callback) { callback(false); callback = ''; }
  });
  div.querySelector('[data-cmd=ok]').addEventListener('click', () => {
    div.style.display = 'none';
  });

  document.addEventListener('keyup', e => {
    if (e.code === 'KeyN' && callback) {
      div.querySelector('[data-cmd=no]').dispatchEvent(new Event('click'));
    }
    else if (e.code === 'KeyY' && callback) {
      div.querySelector('[data-cmd=yes]').dispatchEvent(new Event('click'));
    }
    if (e.code === 'Escape' && callback) {
      div.style.display = 'none';
      callback = '';
    }
  });

  const ts = document.querySelector('#toolbar span');
  let id;

  return {
    confirm(msg, c) {
      p.title = p.textContent = msg;
      div.style.display = 'flex';
      div.dataset.type = 'confirm';
      callback = c;
    },
    warning(msg) {
      p.title = p.textContent = msg;
      div.style.display = 'flex';
      div.dataset.type = 'warning';
    },
    inline(msg) {
      window.clearTimeout(id);
      ts.title = ts.textContent = msg;
      id = window.setTimeout(() => { ts.title = ts.textContent = ''; }, 5000);
    }
  };
})();

// ══════════════════════════════════════════════════════════════════
//  Firefox favicon consent (built dynamically, only for Firefox)
// ══════════════════════════════════════════════════════════════════
if (
  navigator.userAgent.indexOf('Firefox') !== -1 &&
  localStorage.getItem('offer-favicon') !== 'false' &&
  localStorage.getItem('resolve') !== 'true'
) {
  const wrap = document.createElement('div');
  wrap.className = 'favicon';
  wrap.innerHTML =
    '<input type="checkbox"/>' +
    '<div><p>To show bookmark icons, this extension uses the ' +
    '<code>google.com/s2</code> service. Check this box to enable it.</p></div>' +
    '<input type="button" value="×"/>';
  document.body.prepend(wrap);
  document.body.dataset.favicon = 'true';
  wrap.querySelector('input[type=button]').addEventListener('click', () => {
    localStorage.setItem('offer-favicon', false);
    document.body.dataset.favicon = false;
  });
  wrap.querySelector('input[type=checkbox]').addEventListener('change', e => {
    localStorage.setItem('resolve', e.target.checked);
  });
}

// ══════════════════════════════════════════════════════════════════
//  tree helpers
// ══════════════════════════════════════════════════════════════════
function getRoot() {
  return /Firefox/.test(navigator.userAgent) ? 'root________' : '0';
}

// ══════════════════════════════════════════════════════════════════
//  manager (copy / cut / paste)
// ══════════════════════════════════════════════════════════════════
const manager = {
  action: null,

  async copy() {
    const items = [];
    const children = async id => {
      const childs = await chrome.bookmarks.getChildren(id);
      const results = [];
      for (const node of childs) {
        const c = { id: node.id, text: node.title };
        if (node.url) {
          c.url = node.url;
          items.push({ title: node.title, url: node.url });
        }
        else {
          c.children = await children(node.id);
        }
        results.push(c);
      }
      return results;
    };

    const nodes = [];
    for (const id of tree.jstree('get_selected')) {
      const node = tree.jstree('get_node', id);
      const n = { id, text: node.text, url: node.data.url };
      items.push({ title: n.text, url: n.url });
      if (['folder', 'd_folder'].includes(node.type)) {
        n.children = await children(id);
      }
      nodes.push(n);
    }
    {
      const html = items.map(i =>
        `<a href="${i.url || i.title}">${i.title}</a>`).join('<br>');
      const text = items.map(i => i.url || i.title).join('\n');
      navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html':  new Blob([html], { type: 'text/html' })
        })
      ]);
    }
    manager.action = { command: 'copy', nodes };
  },

  cut() {
    const ids = tree.jstree('get_selected').filter(id => {
      const node = tree.jstree('get_node', id);
      return node.data && node.data.drag === true;
    });
    manager.action = { command: 'cut', ids };
  },

  async paste() {
    const ids = tree.jstree('get_selected');
    const node = ids.length ? tree.jstree('get_node', ids[0]) : null;
    if (!node) return notify.inline('Please select a node first');

    const isDir = ['folder', 'd_folder'].includes(node.type);
    const parentId = isDir ? node.id : node.parent;

    manager.action = manager.action || { command: 'copy' };

    if (manager.action.command === 'cut') {
      const realParent = parentId === '#' ? getRoot() : parentId;
      let index = 0;
      if (!isDir) {
        index = tree.jstree('get_node', node.parent).children.indexOf(node.id) + 1;
      }
      if (parentId !== '#' && isDir && !tree.jstree('is_loaded', parentId)) {
        await Promise.race([
          new Promise(resolve => tree.jstree('load_node', parentId, resolve)),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      }
      const dir = tree.jstree('get_node', parentId);
      const wanted = dir ? dir.children : manager.action.ids;
      const current = (await chrome.bookmarks.getChildren(realParent)).map(n => n.id);
      try {
        for (let j = 0; j < wanted.length; j += 1) {
          const id = wanted[j];
          const i = current.indexOf(id);
          if (i === j) continue;
          const result = await chrome.bookmarks.move(id, { parentId: realParent, index: j });
          const target = tree.jstree('get_node', id);
          if (target && result) target.data.index = result.index;
          if (i !== -1) current.splice(i, 1);
          current.splice(j, 0, id);
        }
      }
      catch (e) {
        console.error(e);
        notify.inline(e.message || 'Cannot complete the move');
        tree.jstree('refresh_node', realParent);
      }
    }
    else if (manager.action.command === 'copy') {
      let index = 0;
      if (!isDir) {
        const children = await chrome.bookmarks.getChildren(
          parentId === '#' ? getRoot() : parentId);
        const at = children.findIndex(n => n.id === node.id);
        index = Math.max(0, at) + 1;
      }
      const add = async (n, parentId, index) => {
        const nn = await chrome.bookmarks.create({
          parentId, index, title: n.text, url: n.url
        });
        tree.jstree('create_node', parentId, {
          text: n.text,
          id: nn.id,
          type: n.url ? 'file' : 'folder',
          icon: n.url ? utils.favicon(n.url) : null,
          data: {
            index,
            dateGroupModified: nn.dateGroupModified || Date.now(),
            dateAdded: nn.dateAdded || Date.now(),
            url: n.url || ''
          }
        }, index);
        if (n.children) {
          let mn = 0;
          for (const m of n.children) {
            await add(m, nn.id, mn);
            mn += 1;
          }
        }
      };
      if (!manager.action.nodes) {
        await chrome.permissions.request({ permissions: ['clipboardRead'] });
        const clipboard = await navigator.clipboard.readText();
        if (!clipboard) throw Error('NO_CONTENT_TO_PASTE');
        const items = clipboard.trim().split('\n');
        if (items.some(s => s.trim() === '')) throw Error('INVALID_DATA');
        manager.action.nodes = items.map(s =>
          s.startsWith('http') ? { text: s, url: s } : { text: s });
        if (manager.action.nodes.length > 10) {
          const c = await new Promise(resolve => {
            notify.confirm(
              `About to paste ${manager.action.nodes.length} items from clipboard?`,
              resolve);
          });
          if (!c) {
            delete manager.action.nodes;
            throw Error('USER_ABORT');
          }
          manager.action.next = 'delete';
        }
      }
      for (const n of manager.action.nodes) {
        await add(n, parentId, index);
        index += 1;
      }
      if (manager.action.next === 'delete') {
        delete manager.action.next;
        delete manager.action.nodes;
      }
    }
  }
};

// ══════════════════════════════════════════════════════════════════
//  tree setup
// ══════════════════════════════════════════════════════════════════
const tree = $('#tree');
tree.isFeed = url => url && (url.includes('rss') || url.includes('feed'));

tree.string = {};
tree.plugins = ['dnd', 'types', 'contextmenu'];
if (localStorage.getItem('state') !== 'false') {
  tree.plugins.push('state');
}

tree.element = id => $('#' + id);

tree.hierarchy = id => new Promise(resolve => {
  const ids = [];
  const up = id => {
    ids.push(id);
    chrome.bookmarks.get(id, arr => {
      const node = arr[0];
      if (node.parentId) up(node.parentId);
      else resolve(ids);
    });
  };
  up(id);
});

tree.activate = () => {
  try {
    const ids = tree.jstree('get_selected');
    const id = ids[0];
    tree.jstree('hover_node', tree.element(id));
    tree.element(id).focus();
  }
  catch (e) { console.error(e); }
  window.setTimeout(() => tree.focus(), 100);
};

tree.string.escape = str => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
tree.string.uscape = str => str
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#039;/g, `'`)
  .replace(/&amp;/g, '&');

// ─── context-menu helpers ─────────────────────────────────────────
function createFolder(node, cb) {
  const isDir = ['folder', 'd_folder'].includes(node.type);
  const parentId = isDir ? node.id : node.parent;
  const prp = { parentId, title: 'New Folder', index: 0 };
  if (!isDir) {
    const parent = tree.jstree('get_node', node.parent);
    prp.index = parent.children.indexOf(node.id) + 1;
  }
  chrome.bookmarks.create(prp, bookmark => {
    tree.jstree('create_node', parentId, {
      text: bookmark.title,
      id: bookmark.id,
      type: 'folder',
      icon: null,
      data: {
        index: bookmark.index,
        dateGroupModified: bookmark.dateGroupModified,
        dateAdded: bookmark.dateAdded,
        url: ''
      }
    }, bookmark.index, () => {
      tree.jstree('open_node', parentId);
      tree.jstree('deselect_all');
      tree.jstree('select_node', bookmark.id);
      if (cb) cb(bookmark);
    });
  });
}

function createBookmark(node, url, title) {
  const isDir = ['folder', 'd_folder'].includes(node.type);
  const parentId = isDir ? node.id : node.parent;
  const prp = { parentId, url, title };
  if (isDir) {
    prp.index = 0;
  }
  else {
    const parent = tree.jstree('get_node', node.parent);
    prp.index = parent.children.indexOf(node.id) + 1;
  }
  chrome.bookmarks.create(prp, bookmark => {
    tree.jstree('create_node', parentId, {
      text: bookmark.title,
      id: bookmark.id,
      type: 'file',
      icon: utils.favicon(url),
      data: {
        index: bookmark.index,
        dateGroupModified: bookmark.dateGroupModified,
        dateAdded: bookmark.dateAdded,
        url
      }
    }, bookmark.index, () => {
      tree.jstree('open_node', parentId);
      tree.jstree('deselect_all');
      tree.jstree('select_node', bookmark.id);
    });
  });
}

function deleteNodes(nodes) {
  if (!nodes.length) return;
  notify.confirm(`Are you sure you want to delete:\n\n  ${
    nodes.map((node, i) => (i + 1) + '. ' + (node.data.url || node.text)).join('\n  ')
  }`, a => {
    if (!a) return;
    nodes.forEach(node => {
      const isDir = ['folder', 'd_folder'].includes(node.type);
      chrome.bookmarks[isDir ? 'removeTree' : 'remove'](node.id, () => {
        tree.jstree('select_node', node.parent);
        tree.jstree('delete_node', node.id);
      });
    });
  });
}

// ─── main tree ────────────────────────────────────────────────────
tree.jstree({
  'types': {
    'file':     { 'icon': 'item',     'max_children': 0 },
    'folder':   { 'icon': 'folder' },
    'd_folder': { 'icon': 'd_folder' }
  },
  'plugins': tree.plugins,
  'core': {
    'worker': !/Firefox/.test(navigator.userAgent),
    'check_callback': (operation, node) => {
      if (operation === 'move_node') return node.data.drag;
      if (operation === 'edit') return false;
      return true;
    },
    'multiple': true,
    'data': async (obj, cb) => {
      if (obj.data && obj.data.feed) {
        try {
          const r = await fetch(obj.data.url);
          if (!r.ok) throw Error('FETCH_FAILED_' + r.status);
          const str = await r.text();
          const doc = (new DOMParser()).parseFromString(str, 'text/xml');
          const items = [...doc.querySelectorAll('item')];
          if (items && items.length) {
            cb(items.map(item => {
              const url = item.querySelector('link').textContent;
              const title = item.querySelector('title').textContent || 'unknown title';
              const date = item.querySelector('pubDate').textContent || '';
              return {
                text: tree.string.escape(title),
                id: 'feed-' + Math.random(),
                type: 'file',
                icon: utils.favicon(url),
                children: false,
                a_attr: { href: url },
                data: {
                  dateGroupModified: date,
                  dateAdded: date,
                  url,
                  feed: tree.isFeed(url),
                  drag: false
                }
              };
            }));
          }
          else throw Error('empty feed');
        }
        catch (e) {
          cb([{
            text: e.message || 'unknown error',
            id: 'feed-' + Math.random(),
            type: 'file', icon: '', children: false,
            a_attr: { href: '' },
            data: { dateGroupModified: '', dateAdded: '', url: '', feed: false, drag: false }
          }]);
        }
      }
      else {
        const nodes = await chrome.bookmarks.getChildren(
          obj.id === '#' ? getRoot() : obj.id);
        cb(nodes.map(node => {
          const feed = tree.isFeed(node.url);
          const children = !node.url || feed === true;
          const drag = node.parentId !== '0' && node.parentId !== 'root________';
          const rtn = {
            text: node.type === 'separator' ? '..............' : tree.string.escape(node.title),
            id: node.id,
            type: children ? (drag ? 'folder' : 'd_folder')
                          : (node.type === 'separator' ? 'separator' : 'file'),
            icon: children ? null : utils.favicon(node.url),
            children,
            a_attr: { href: node.url || '#' },
            data: {
              type: node.type,
              index: node.index,
              dateGroupModified: node.dateGroupModified,
              dateAdded: node.dateAdded,
              url: node.url || '',
              feed, drag
            },
            state: { hidden: node.url && node.url.startsWith('place:') }
          };
          if (node.type === 'separator') {
            rtn.li_attr = { 'class': 'separator' };
          }
          return rtn;
        }));
      }
    }
  },
  'contextmenu': {
    'items': node => {
      const items = {};

      // ─── New Folder (for every node) ───
      items['New Folder'] = {
        'label': 'New Folder', 'icon': 'cm-folder-plus',
        'action': () => createFolder(node)
      };

      // ─── New Bookmark (for folder nodes) ───
      if (['folder', 'd_folder'].includes(node.type)) {
        items['New Bookmark'] = {
          'label': 'New Bookmark', 'icon': 'cm-bookmark-plus',
          'action': () => createBookmark(node, 'http://example.com', 'new bookmark')
        };
        items['Bookmark this Tab'] = {
          'label': 'Bookmark this Tab', 'icon': 'cm-tab',
          'action': () => {
            chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
              createBookmark(node, tabs[0].url, tabs[0].title);
            });
          }
        };
      }

      // ─── Copy Properties submenu ───
      {
        const submenu = {};
        submenu['Copy Title'] = {
          'label': 'Copy Title', 'icon': 'cm-type',
          'action': () => {
            const ids = tree.jstree('get_selected');
            const nodes = ids.map(id => tree.jstree('get_node', id));
            utils.copy(nodes.map(n => n.text).join('\n'));
          }
        };
        if (node.data.url) {
          submenu['Copy Link'] = {
            'label': 'Copy Link', 'icon': 'cm-link',
            'action': () => {
              const ids = tree.jstree('get_selected');
              const nodes = ids.map(id => tree.jstree('get_node', id));
              utils.copy(nodes.map(n => n.data.url).join('\n'));
            }
          };
        }
        submenu['Copy ID'] = {
          'label': 'Copy ID', 'icon': 'cm-hash',
          'action': () => {
            const ids = tree.jstree('get_selected');
            utils.copy(ids.join('\n'));
          }
        };
        items['Copy Properties'] = {
          'label': 'Copy Properties', 'icon': 'cm-copy',
          'separator_before': true,
          submenu
        };
      }

      items['Copy Bookmark'] = {
        'label': 'Copy Bookmark', 'icon': 'cm-copy',
        'action': () => manager.copy()
      };

      if (node.data.drag) {
        items['Cut Bookmark'] = {
          'label': 'Cut Bookmark', 'icon': 'cm-scissors',
          'action': () => manager.cut()
        };
      }

      items['Paste Bookmark'] = {
        'label': 'Paste Bookmark', 'icon': 'cm-clipboard',
        'action': () => {
          manager.paste().catch(e => {
            console.error(e);
            notify.inline(e.message);
          });
        }
      };

      if (node.data.url) {
        items['Open'] = {
          'label': 'Open', 'icon': 'cm-external',
          'separator_before': true,
          'submenu': {
            'Open Link in New Tab': {
              'label': 'Open Link in New Tab', 'icon': 'cm-tab-new',
              'action': () => dispatchEvent(new CustomEvent(
                'actions:open-links', { detail: 'new-tab' }))
            },
            'Open Link in Background Tab': {
              'label': 'Open Link in Background Tab', 'icon': 'cm-tab-bg',
              'action': () => dispatchEvent(new CustomEvent(
                'actions:open-links', { detail: 'background-tab' }))
            },
            'Open Link in New Window': {
              'label': 'Open Link in New Window', 'icon': 'cm-window',
              'action': () => dispatchEvent(new CustomEvent(
                'actions:open-links', { detail: 'new-window' }))
            },
            'Open Link in Incognito Window': {
              'label': 'Open Link in Incognito Window', 'icon': 'cm-incognito',
              'action': () => dispatchEvent(new CustomEvent(
                'actions:open-links', { detail: 'incognito-window' }))
            }
          }
        };
      }

      if (node.data.drag) {
        const submenu = {};
        submenu['Rename Title'] = {
          'label': 'Rename Title', 'icon': 'cm-pencil',
          'action': () => dispatchEvent(new Event('properties:select-title'))
        };
        if (node.data.url) {
          submenu['Change Link'] = {
            'label': 'Change Link', 'icon': 'cm-link',
            'action': () => dispatchEvent(new Event('properties:select-link'))
          };
          submenu['Update Title from Page'] = {
            'label': 'Update Title from Page', 'icon': 'cm-refresh',
            'action': () => dispatchEvent(new Event('actions:update-title'))
          };
        }
        items['Edit'] = { 'label': 'Edit', 'icon': 'cm-pencil', 'separator_before': true, submenu };
      }

      if (node.data.drag) {
        items['Delete Bookmark'] = {
          'label': 'Delete Bookmark', 'icon': 'cm-trash',
          'action': () => {
            const ids = tree.jstree('get_selected');
            deleteNodes(ids.map(id => tree.jstree('get_node', id)));
          }
        };
      }

      return items;
    }
  }
});

// ══════════════════════════════════════════════════════════════════
//  tree events
// ══════════════════════════════════════════════════════════════════
tree.one('state_ready.jstree', () => {
  const ids = tree.jstree('get_selected');
  if (ids.length) {
    const node = tree.jstree('get_node', ids[0], true)[0];
    node.scrollIntoView({ block: 'center' });
  }
  tree.activate();
});

// open on dblclick / Enter
{
  const dblclick = (node, e = { shiftKey: false }) => {
    if (node && node.data && node.data.url && node.data.feed === false) {
      const url = node.data.url;
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if ((tabs.length && tabs[0].url === 'chrome://newtab/') ||
            tabs[0].url === 'about:newtab' || e.shiftKey) {
          chrome.tabs.update({ url });
        }
        else {
          chrome.tabs.create({ url });
        }
        window.close();
      });
    }
  };
  tree.on('dblclick.jstree', e => {
    const ids = tree.jstree('get_selected');
    const node = tree.jstree('get_node', ids[0]);
    dblclick(node, e);
  });
  tree.on('keydown.tree', e => {
    if (e.key !== 'Enter') return true;
    const selected = tree.jstree('get_selected');
    const current = tree.jstree('get_node', e.target);
    if (e.altKey && current.type === 'file') return true;
    if (current && selected.indexOf(current.id) !== -1) {
      dblclick(current);
      return false;
    }
    return true;
  });
}

// drag&drop sync
tree.on('move_node.jstree copy_node.jstree', (e, data) => {
  if (e.type === 'copy_node') {
    const b = {
      parentId: data.parent,
      index: data.position,
      title: data.node.text,
      url: data.original.data.url
    };
    if (!b.url) delete b.url;
    chrome.bookmarks.create(b, bookmark => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        notify.inline('[Refresh Required] ' + lastError.message);
        tree.jstree('delete_node', data.node);
      }
      else {
        tree.jstree(true).set_id(data.node, bookmark.id);
        data.node.data = {
          index: bookmark.index,
          dateGroupModified: bookmark.dateGroupModified,
          dateAdded: bookmark.dateAdded,
          url: bookmark.url || ''
        };
        data.original.children.forEach((id, index) => {
          const original = tree.jstree('get_node', id);
          const position = tree.jstree('get_node', data.original).children.indexOf(id);
          tree.trigger('copy_node.jstree', {
            node: tree.jstree('get_node', data.node.children[index]),
            original, parent: bookmark.id, position
          });
        });
      }
    });
  }
  else {
    let index = data.position;
    if (data.old_parent === data.parent && data.position > data.old_position) {
      if (!/Firefox/.test(navigator.userAgent)) index += 1;
    }
    const after = bookmark => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        notify.inline('[Refresh Required] ' + lastError.message);
        if (data.parent !== '#') tree.jstree('refresh_node', data.parent);
        if (data.old_parent !== data.parent) tree.jstree('refresh_node', data.old_parent);
        return;
      }
      if (bookmark) data.node.data.index = bookmark.index;
    };
    if (data.parent === '#') {
      notify.inline('[Refresh Required] Cannot move to the tree root');
      tree.jstree('refresh_node', data.old_parent);
    }
    else {
      chrome.bookmarks.getChildren(data.parent, children => {
        chrome.bookmarks.move(data.node.id, {
          parentId: data.parent,
          index: Math.min(index, children.length)
        }, after);
      });
    }
  }
});

// ══════════════════════════════════════════════════════════════════
//  open-links handler
// ══════════════════════════════════════════════════════════════════
addEventListener('actions:open-links', e => {
  const ids = tree.jstree('get_selected');
  const nodes = ids.map(id => tree.jstree('get_node', id));

  if (e.detail === 'new-tab' || e.detail === 'background-tab') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      nodes.forEach((node, n) => {
        if (node.data.url) {
          chrome.tabs.create({
            url: node.data.url,
            active: e.detail === 'new-tab',
            index: tab.index + n + 1
          }).catch(err => notify.inline(err.message));
        }
      });
    });
  }
  else if (e.detail === 'new-window' || e.detail === 'incognito-window') {
    chrome.windows.create({
      url: nodes.map(n => n.data.url).filter(Boolean),
      incognito: e.detail === 'incognito-window',
      focused: true
    }).catch(err => notify.inline(err.message));
  }
});

// ══════════════════════════════════════════════════════════════════
//  update-title-from-page
// ══════════════════════════════════════════════════════════════════
addEventListener('actions:update-title', () => {
  const ids = tree.jstree('get_selected');
  if (ids.length !== 1) return notify.inline('Select a single bookmark');
  const node = tree.jstree('get_node', ids[0]);
  if (!node.data.url) return notify.inline('This bookmark is not representing a webpage');

  chrome.permissions.request({ origins: [node.data.url] }, () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 6000);
    fetch(node.data.url, { signal: controller.signal })
      .then(r => r.text())
      .then(content => {
        const doc = (new DOMParser()).parseFromString(content, 'text/html');
        const el = doc.querySelector('title');
        if (el && el.textContent) {
          const input = document.querySelector('#properties input[name=title]');
          if (input.value === el.textContent) throw Error('"title" is up-to-date');
          input.value = el.textContent;
          input.dispatchEvent(new Event('keyup', { bubbles: true }));
          return;
        }
        throw Error('Cannot find title');
      })
      .catch(err => {
        console.warn(err);
        notify.inline(err.message);
      });
  });
});

// ══════════════════════════════════════════════════════════════════
//  theme
// ══════════════════════════════════════════════════════════════════
{
  const dark = () => {
    tree.jstree('set_theme', 'default-dark');
    document.documentElement.classList.add('dark');
  };
  const light = () => {
    tree.jstree('set_theme', 'default');
    document.documentElement.classList.remove('dark');
  };
  const run = () => {
    const ts = localStorage.getItem('theme-source') || 'auto';
    document.documentElement.dataset.themeSource = ts;
    if (ts === 'auto') {
      if (matchMedia('(prefers-color-scheme: dark)').matches) return dark();
    }
    else if (ts === 'dark') return dark();
    light();
  };
  run();
  matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => run());
  addEventListener('theme:update', run);
}

// clipboard events on the tree
tree.on('copy', e => { e.preventDefault(); e.stopPropagation(); manager.copy(); });
tree.on('cut',  e => { e.preventDefault(); e.stopPropagation(); manager.cut(); });
tree.on('paste', e => {
  e.preventDefault();
  e.stopPropagation();
  manager.paste().catch(err => {
    console.error(err);
    notify.inline(err.message);
  });
});

// ══════════════════════════════════════════════════════════════════
//  properties panel
// ══════════════════════════════════════════════════════════════════
{
  const properties = document.querySelector('#properties');
  const titleInput = properties.querySelector('input[name=title]');
  const urlInput   = properties.querySelector('input[name=url]');
  const titleBtn   = properties.querySelector('button[data-cmd=change-title]');
  const urlBtn     = properties.querySelector('button[data-cmd=change-url]');

  const refreshButton = (input, btn) => {
    btn.disabled = !(input.dataset.value !== input.value && input.value);
  };
  titleInput.addEventListener('keyup', () => refreshButton(titleInput, titleBtn));
  urlInput.addEventListener('keyup',   () => refreshButton(urlInput, urlBtn));

  const applyChange = async (input, prp, shiftKey) => {
    const id = properties.dataset.id;
    const ids = shiftKey ? tree.jstree('get_selected') : [id];
    for (const id of ids) {
      try {
        await chrome.bookmarks.update(id, prp);
        input.dataset.value = input.value;
        if (prp.title !== undefined) {
          tree.jstree('set_text', id, tree.string.escape(prp.title));
        }
      }
      catch (err) {
        console.error(err);
        notify.inline('[Refresh Required] ' + err.message);
      }
    }
    refreshButton(titleInput, titleBtn);
    refreshButton(urlInput, urlBtn);
  };

  titleBtn.addEventListener('click', e => {
    applyChange(titleInput, { title: titleInput.value }, e.shiftKey);
  });
  urlBtn.addEventListener('click', e => {
    applyChange(urlInput, { url: urlInput.value }, e.shiftKey);
  });

  addEventListener('properties:select-title', () => {
    titleInput.focus(); titleInput.select();
  });
  addEventListener('properties:select-link', () => {
    urlInput.focus(); urlInput.select();
  });

  const heroTitle = properties.querySelector('[data-id=hero-title]');
  const heroSub   = properties.querySelector('[data-id=hero-sub]');

  for (const [input, btn] of [[titleInput, titleBtn], [urlInput, urlBtn]]) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !btn.disabled) {
        e.preventDefault();
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: e.shiftKey }));
      }
    });
  }

  const showNode = node => {
    properties.dataset.id = node.id;
    properties.dataset.type = node.type;

    titleInput.dataset.value = titleInput.value = tree.string.uscape(node.text);
    titleInput.dispatchEvent(new Event('keyup'));
    titleInput.disabled = node.id.startsWith('feed-') || node.data.drag === false;

    urlInput.disabled = node.data.drag === false || node.data.url === '';
    urlInput.dataset.value = urlInput.value = node.data.url;
    urlInput.dispatchEvent(new Event('keyup'));

    const d = new Date(node.data.dateAdded);
    properties.querySelector('[data-id=date]').textContent =
      isNaN(d) ? '' : d.toDateString() + ' ' + d.toLocaleTimeString();

    heroTitle.textContent = tree.string.uscape(node.text);
    if (node.data.url) {
      try { heroSub.textContent = new URL(node.data.url).hostname || node.data.url; }
      catch (err) { heroSub.textContent = node.data.url; }
    }
    else {
      heroSub.textContent = node.type === 'd_folder' ? 'Default folder' : 'Folder';
    }
    if (typeof node.icon === 'string' && node.icon.indexOf('/') !== -1) {
      properties.style.setProperty('--fav', 'url("' + node.icon.replace(/"/g, '%22') + '")');
    }
    else {
      properties.style.removeProperty('--fav');
    }
  };

  tree.on('select_node.jstree', (e, data) => showNode(data.node));

  tree.one('state_ready.jstree', () => {
    const ids = tree.jstree('get_selected');
    const node = ids.length ? tree.jstree('get_node', ids[0]) : null;
    if (node && node.data) showNode(node);
  });
}

// ══════════════════════════════════════════════════════════════════
//  toolbar
// ══════════════════════════════════════════════════════════════════
document.addEventListener('click', e => {
  const cmd = e.target.dataset.cmd;

  if (cmd === 'collapse') {
    tree.jstree('deselect_all');
    tree.jstree('close_all');
  }
  else if (cmd === 'bookmark-manager') {
    chrome.tabs.create({ url: 'chrome://bookmarks/' },
      () => chrome.runtime.lastError && notify.warning(chrome.runtime.lastError.message));
  }
  else if (cmd === 'theme-toggle') {
    const cycle = ['auto', 'light', 'dark'];
    const current = localStorage.getItem('theme-source') || 'auto';
    const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
    localStorage.setItem('theme-source', next);
    dispatchEvent(new Event('theme:update'));
    notify.inline('Theme: ' + next);
  }
});

// Delete / Backspace on tree
document.addEventListener('keydown', e => {
  if (e.code === 'Delete' || e.code === 'Backspace') {
    if (e.target.tagName !== 'INPUT') {
      const ids = tree.jstree('get_selected');
      if (ids.length) {
        deleteNodes(ids.map(id => tree.jstree('get_node', id)));
        e.stopImmediatePropagation();
        return false;
      }
    }
  }
});