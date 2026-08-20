/* Royal CRM Mini App — admin team photo bridge v0.6.0-photo.1 */
(() => {
  const VERSION = '0.6.0-photo.1';
  const MAX_SERVER_BYTES = 650000;
  const TARGET_BYTES = 560000;
  const MAX_DIMENSION = 1280;
  const formStates = new WeakMap();
  const nativeFetch = window.fetch.bind(window);

  const clean = value => String(value == null ? '' : value).trim();

  function installCss() {
    if (document.querySelector('link[data-admin-team-photo-css="1"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'admin-team-photo-v0600.css?v=20260820-1018';
    link.dataset.adminTeamPhotoCss = '1';
    document.head.appendChild(link);
  }

  function statusNode(form) { return form?.querySelector('[data-admin-team-photo-status]'); }
  function previewNode(form) { return form?.querySelector('[data-admin-team-photo-preview]'); }

  function setStatus(form, text, type='') {
    const node = statusNode(form);
    if (!node) return;
    node.className = `royal-admin-photo-status ${type ? `is-${type}` : ''}`;
    node.textContent = clean(text);
  }

  function revokePreview(state) {
    if (!state?.previewUrl) return;
    try { URL.revokeObjectURL(state.previewUrl); } catch (_) {}
    state.previewUrl = '';
  }

  function renderPreview(form, blob) {
    const state = formStates.get(form) || {};
    revokePreview(state);
    const preview = previewNode(form);
    if (!preview) return;
    if (!blob) {
      preview.innerHTML = '🏰';
      formStates.set(form, state);
      return;
    }
    const url = URL.createObjectURL(blob);
    state.previewUrl = url;
    formStates.set(form, state);
    preview.innerHTML = `<img alt="Новое фото команды" src="${url}">`;
  }

  function decorateForm(form) {
    if (!form || form.dataset.adminTeamPhotoDecorated === '1') return;
    form.dataset.adminTeamPhotoDecorated = '1';
    const grid = form.querySelector('.royal-admin-form-grid');
    if (!grid) return;

    const creating = form.dataset.writeMode === 'create';
    const box = document.createElement('div');
    box.className = 'royal-admin-photo-box';
    box.dataset.adminTeamPhotoBox = '1';
    box.innerHTML = `
      <div class="royal-admin-photo-head">
        <strong>Фото команды</strong>
        <small>${creating ? 'можно добавить сразу' : 'без выбора старое фото сохранится'}</small>
      </div>
      <div class="royal-admin-photo-picker">
        <div class="royal-admin-photo-preview" data-admin-team-photo-preview>🏰</div>
        <div class="royal-admin-photo-controls">
          <label class="royal-admin-photo-button">📷 Выбрать фото
            <input type="file" accept="image/*" data-admin-team-photo-input>
          </label>
          <div class="royal-admin-photo-status" data-admin-team-photo-status>JPG/PNG/WEBP или фото из галереи. Перед отправкой изображение автоматически уменьшается.</div>
        </div>
      </div>
      <div class="royal-admin-photo-note">Удаление фото в v0.6 отключено. Новое фото заменяет текущее только после успешного сохранения.</div>`;
    grid.appendChild(box);
    formStates.set(form, { photo:null, promise:null, error:null, previewUrl:'' });
  }

  async function fileToProcessedPhoto(file, form) {
    if (!file) return null;
    if (file.size > 25 * 1024 * 1024) throw new Error('Исходное фото слишком большое. Выберите файл до 25 МБ.');

    setStatus(form, 'Обрабатываем фото…', 'working');
    const bitmap = await decodeImage(file);
    try {
      const originalWidth = Number(bitmap.width || bitmap.naturalWidth || 0);
      const originalHeight = Number(bitmap.height || bitmap.naturalHeight || 0);
      if (!originalWidth || !originalHeight) throw new Error('Не удалось определить размер изображения.');

      let scale = Math.min(1, MAX_DIMENSION / Math.max(originalWidth, originalHeight));
      let width = Math.max(1, Math.round(originalWidth * scale));
      let height = Math.max(1, Math.round(originalHeight * scale));
      let best = null;

      for (let pass = 0; pass < 6; pass += 1) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha:false });
        if (!ctx) throw new Error('Браузер не смог обработать изображение.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,width,height);
        ctx.drawImage(bitmap,0,0,width,height);

        const qualities = [0.86,0.78,0.70,0.62,0.54];
        for (const quality of qualities) {
          const blob = await canvasToBlob(canvas,'image/jpeg',quality);
          if (!blob) continue;
          if (!best || blob.size < best.size) best = blob;
          if (blob.size <= TARGET_BYTES) {
            best = blob;
            break;
          }
        }
        if (best && best.size <= TARGET_BYTES) break;
        width = Math.max(320, Math.round(width * 0.82));
        height = Math.max(320, Math.round(height * 0.82));
      }

      if (!best) throw new Error('Не удалось подготовить изображение.');
      if (best.size > MAX_SERVER_BYTES) throw new Error('Фото не удалось уменьшить до безопасного размера. Выберите другое изображение.');

      const data = await blobToBase64(best);
      renderPreview(form,best);
      setStatus(form, `Готово: ${Math.round(best.size/1024)} КБ · ${width}×${height}`, 'ok');
      return {
        data,
        mime:'image/jpeg',
        bytes:best.size,
        name:clean(file.name).slice(0,120) || 'team-photo.jpg'
      };
    } finally {
      try { bitmap.close?.(); } catch (_) {}
      try { if (bitmap.__royalObjectUrl) URL.revokeObjectURL(bitmap.__royalObjectUrl); } catch (_) {}
    }
  }

  async function decodeImage(file) {
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(file, { imageOrientation:'from-image' }); }
      catch (_) {}
    }
    return await new Promise((resolve,reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { img.__royalObjectUrl = url; resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Формат фото не поддерживается этим телефоном. Попробуйте JPG или PNG.')); };
      img.src = url;
    });
  }

  function canvasToBlob(canvas,type,quality) {
    return new Promise(resolve => canvas.toBlob(resolve,type,quality));
  }

  async function blobToBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let i=0;i<bytes.length;i+=chunk) {
      binary += String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
    }
    return btoa(binary);
  }

  function selectedPhotoPromise() {
    const form = document.querySelector('[data-admin-write-modal="1"] [data-write-team-form="1"]');
    if (!form) return null;
    const state = formStates.get(form);
    if (!state) return null;
    return state.promise || Promise.resolve(state.photo || null);
  }

  window.fetch = async function royalAdminPhotoFetch(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = clean(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    if (!/\/admin-write(?:$|\?)/.test(url) || method !== 'POST' || !init?.body) {
      return nativeFetch(input,init);
    }

    let requestBody;
    try { requestBody = JSON.parse(String(init.body)); }
    catch (_) { return nativeFetch(input,init); }
    if (!requestBody || (requestBody.op !== 'createTeam' && requestBody.op !== 'updateTeam')) {
      return nativeFetch(input,init);
    }

    const promise = selectedPhotoPromise();
    if (promise) {
      let photo;
      try { photo = await promise; }
      catch (error) { throw error; }
      if (photo) {
        if (requestBody.op === 'createTeam') {
          requestBody.payload = { ...(requestBody.payload || {}), photo };
        } else {
          requestBody.payload = {
            ...(requestBody.payload || {}),
            changes:{ ...(requestBody.payload?.changes || {}), photo }
          };
        }
        init = { ...init, body:JSON.stringify(requestBody) };
      }
    }
    return nativeFetch(input,init);
  };

  document.addEventListener('change', event => {
    const input = event.target?.closest?.('[data-admin-team-photo-input]');
    if (!input) return;
    const form = input.closest('[data-write-team-form]');
    if (!form) return;
    const state = formStates.get(form) || { photo:null,promise:null,error:null,previewUrl:'' };
    const file = input.files?.[0] || null;
    state.photo = null;
    state.error = null;
    if (!file) {
      state.promise = null;
      renderPreview(form,null);
      setStatus(form,'Новое фото не выбрано. Текущее фото останется без изменений.');
      formStates.set(form,state);
      return;
    }

    const promise = fileToProcessedPhoto(file,form)
      .then(photo => {
        state.photo = photo;
        state.error = null;
        return photo;
      })
      .catch(error => {
        state.photo = null;
        state.error = error;
        renderPreview(form,null);
        setStatus(form,error?.message || 'Не удалось обработать фото.','error');
        throw error;
      });
    state.promise = promise;
    formStates.set(form,state);
  },true);

  // If photo processing failed, suppress form submit before the base write module.
  window.addEventListener('submit', event => {
    const form = event.target;
    if (!form?.matches?.('[data-write-team-form]')) return;
    const state = formStates.get(form);
    if (!state?.error) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setStatus(form,state.error?.message || 'Сначала выберите другое фото.','error');
  },true);

  const observer = new MutationObserver(() => {
    document.querySelectorAll('[data-write-team-form]').forEach(decorateForm);
  });
  observer.observe(document.body,{childList:true,subtree:true});

  installCss();
  document.querySelectorAll('[data-write-team-form]').forEach(decorateForm);
  window.RoyalAdminTeamPhotoV0600 = { version:VERSION, maxBytes:MAX_SERVER_BYTES };
  try {
    if (window.RoyalAdminWriteV0600) window.RoyalAdminWriteV0600.version = '0.6.0-write.4';
  } catch (_) {}
})();
