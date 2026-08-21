const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'admin-entry-relocation-v0600.js'),
  'utf8'
);

class Element {
  constructor(tagName, className = '') {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.listeners = {};
    this.tabIndex = 0;
    this.innerHTML = '';
    this.type = '';
    this.classList = {
      add: name => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        names.add(name);
        this.className = [...names].join(' ');
      }
    };
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  click() {
    this.listeners.click?.({
      preventDefault() {},
      stopImmediatePropagation() {}
    });
  }
}

test('admin entry is moved inside the self-profile head and opens admin mode', () => {
  const body = new Element('body');
  const profileHead = new Element('div', 'self-profile-head');
  const tile = new Element('button', 'royal-admin-tile');
  tile.attributes['data-admin-mode'] = '1';
  body.appendChild(profileHead);
  body.appendChild(tile);

  const findByClass = className => {
    const queue = [body];
    while (queue.length) {
      const current = queue.shift();
      if (current.className.split(/\s+/).includes(className)) return current;
      queue.push(...current.children);
    }
    return null;
  };
  const document = {
    body,
    createElement: tagName => new Element(tagName),
    querySelector(selector) {
      if (selector === '[data-admin-mode="1"]') return tile;
      if (selector === '#selfProfileCard .self-profile-head') return profileHead;
      if (selector === '.royal-admin-header-entry') return findByClass('royal-admin-header-entry');
      return null;
    }
  };
  let opened = 0;
  const sandbox = {
    document,
    window: { RoyalAdminV0600: { open: value => { assert.equal(value, false); opened += 1; } } },
    MutationObserver: class { observe() {} },
    setTimeout: callback => { callback(); return 1; }
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'admin-entry-relocation-v0600.js' });

  const button = findByClass('royal-admin-header-entry');
  assert(button);
  assert.equal(button.parentElement, profileHead);
  assert.equal(tile.attributes['aria-hidden'], 'true');
  assert(tile.className.includes('royal-admin-tile--relocated'));
  assert.equal(button.attributes['aria-label'], 'Открыть админ-режим');
  button.click();
  assert.equal(opened, 1);
});
