(function () {
  const _cfg = window.REDMINE_CONFIG || {};
  const REDMINE_URL = String(_cfg.baseUrl || '').replace(/\/+$/, '');
  const REDMINE_KEY = String(_cfg.apiKey || '').trim();
  const PROJECT_ID = Number(_cfg.projectId || 0);
  const TRACKER_ID = Number(_cfg.trackerId || 0);
  const COLLECT_IP = Boolean(_cfg.collectPublicIp);
  const MAX_BYTES = Number(_cfg.maxImageBytes) || 5 * 1024 * 1024;
  const PRIORITY_IDS = { low: 1, normal: 2, high: 3, urgent: 4, ...(_cfg.priorityIds || {}) };

  const PRIORITY_BY_UI_VALUE = {
    '1': PRIORITY_IDS.low,
    '2': PRIORITY_IDS.normal,
    '3': PRIORITY_IDS.high,
    '4': PRIORITY_IDS.urgent,
  };

  const form = document.getElementById('ticketForm');
  const subjectInput = document.getElementById('subject');
  const subjectCount = document.getElementById('subjectCount');
  const subjectError = document.getElementById('subjectError');
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('screenshot');
  const uploadPlaceholder = document.getElementById('uploadPlaceholder');
  const imagePreview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const removeImage = document.getElementById('removeImage');
  const fileName = document.getElementById('fileName');
  const submitBtn = document.getElementById('submitBtn');
  const submitLabel = document.getElementById('submitLabel');
  const resetBtn = document.getElementById('resetBtn');
  const toast = document.getElementById('toast');
  const toastTitle = document.getElementById('toastTitle');
  const toastMessage = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');
  const toastClose = document.getElementById('toastClose');

  function configurationError() {
    if (!REDMINE_KEY || REDMINE_KEY.includes('REEMPLAZAR'))
      return 'Falta la API key en config.local.js.';
    if (!Number.isInteger(PROJECT_ID) || PROJECT_ID < 1)
      return 'Falta el projectId real en config.local.js.';
    if (!Number.isInteger(TRACKER_ID) || TRACKER_ID < 1)
      return 'Falta el trackerId real en config.local.js.';
    return '';
  }

  subjectInput.addEventListener('input', () => {
    const len = subjectInput.value.length;
    subjectCount.textContent = `${len} / 120`;
    if (len > 0) clearError(subjectInput, subjectError);
  });

  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) showPreview(file);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) showPreview(fileInput.files[0]);
  });

  function showPreview(file) {
    const err = validateImage(file);
    if (err) { clearImage(); showToast('error', 'Archivo no válido', err); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      if (typeof result === 'string') {
        previewImg.src = result;
        fileName.textContent = file.name;
        uploadPlaceholder.classList.add('hidden');
        imagePreview.classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);
  }

  removeImage.addEventListener('click', (e) => { e.stopPropagation(); clearImage(); });
  function clearImage() {
    fileInput.value = '';
    previewImg.src = '';
    fileName.textContent = '';
    imagePreview.classList.add('hidden');
    uploadPlaceholder.classList.remove('hidden');
  }

  resetBtn.addEventListener('click', () => {
    clearImage();
    subjectCount.textContent = '0 / 120';
    clearError(subjectInput, subjectError);
  });

  function showError(input, errorEl) { input.classList.add('invalid'); errorEl.classList.add('visible'); }
  function clearError(input, errorEl) { input.classList.remove('invalid'); errorEl.classList.remove('visible'); }

  function validate() {
    let ok = true;
    if (!subjectInput.value.trim()) { showError(subjectInput, subjectError); ok = false; }
    return ok;
  }

  function validateImage(file) {
    if (!file) return '';
    if (!file.type.startsWith('image/')) return 'Solo se permiten archivos de imagen.';
    if (file.size > MAX_BYTES) return 'La imagen supera el tamaño máximo de 5 MB.';
    return '';
  }

  let toastTimer;
  function showToast(type, title, message) {
    clearTimeout(toastTimer);
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    toastIcon.textContent = type === 'success' ? '✅' : '❌';
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    toastTimer = setTimeout(hideToast, 6000);
  }
  function hideToast() { toast.classList.add('hidden'); }
  toastClose.addEventListener('click', hideToast);

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitLabel.textContent = loading ? 'Enviando...' : 'Enviar Ticket';
    const existing = submitBtn.querySelector('.spinner');
    const icon = submitBtn.querySelector('svg');
    if (loading && !existing) {
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      submitBtn.insertBefore(spinner, submitBtn.firstChild);
      if (icon) icon.classList.add('hidden');
    } else if (!loading && existing) {
      existing.remove();
      if (icon) icon.classList.remove('hidden');
    }
  }

  async function getClientIP() {
    if (!COLLECT_IP) return 'No recopilada.';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      return data.ip || 'No disponible.';
    } catch { return 'No disponible.'; }
  }

  async function uploadImage(file) {
    const res = await fetch(`${REDMINE_URL}/uploads.json?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: {
        'X-Redmine-API-Key': REDMINE_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: file,
    });
    if (!res.ok) throw new Error(`Error al subir imagen: HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.upload?.token) throw new Error('Redmine no devolvió el token de la imagen.');
    return data.upload.token;
  }

  async function sendTicket(subject, description, priorityId, imageToken, imageName, imageType) {
    const issue = {
      project_id: PROJECT_ID,
      tracker_id: TRACKER_ID,
      subject,
      description: description || '',
      priority_id: priorityId,
    };

    if (imageToken) {
      issue.uploads = [{
        token: imageToken,
        filename: imageName,
        content_type: imageType || 'application/octet-stream',
      }];
    }

    const res = await fetch(`${REDMINE_URL}/issues.json`, {
      method: 'POST',
      headers: {
        'X-Redmine-API-Key': REDMINE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ issue }),
    });

    if (!res.ok) {
      const msgs = { 401: 'API key inválida.', 403: 'Sin permiso.', 422: 'Datos inválidos.', 500: 'Error en Redmine.' };
      throw new Error(msgs[res.status] || `HTTP ${res.status}`);
    }

    const location = res.headers.get('Location') || '';
    const match = location.match(/\/issues\/(\d+)/);
    return match ? match[1] : null;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const problem = configurationError();
    if (problem) { showToast('error', 'Configuración pendiente', problem); return; }

    setLoading(true);
    try {
      const ip = await getClientIP();
      const now = new Date().toLocaleString('es-HN');
      const rawSubject = subjectInput.value.trim();
      const descriptionEl = document.getElementById('description');
      const rawDescription = descriptionEl ? descriptionEl.value.trim() : '';
      const priorityInput = document.querySelector('input[name="priority"]:checked');
      const priorityUiVal = priorityInput ? priorityInput.value : '2';
      const priorityId = Number(PRIORITY_BY_UI_VALUE[priorityUiVal]);

      const description = [
        rawDescription || 'Sin descripción adicional.',
        '',
        '--- Datos del reporte ---',
        `Fecha local: ${now}`,
        `IP pública: ${ip}`,
      ].join('\n');

      let imageToken = null;
      let imageName = null;
      let imageType = null;
      const file = fileInput.files[0];
      if (file) {
        imageToken = await uploadImage(file);
        imageName = file.name;
        imageType = file.type || 'application/octet-stream';
      }

      const issueId = await sendTicket(rawSubject, description, priorityId, imageToken, imageName, imageType);
      const extra = issueId ? ` Ticket #${issueId}.` : '';
      showToast('success', 'Ticket enviado', `El ticket fue registrado correctamente en Redmine.${extra}`);
      form.reset();
      clearImage();
      subjectCount.textContent = '0 / 120';
    } catch (err) {
      console.error(err);
      showToast('error', 'Error al enviar', err.message || 'No se pudo conectar con Redmine.');
    } finally {
      setLoading(false);
    }
  });
})();