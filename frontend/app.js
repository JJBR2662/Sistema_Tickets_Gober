const REDMINE_URL = 'URL_REDMINE';
const REDMINE_KEY = 'API_KEY';
const PROJECT_ID = 'ID_PROYECTO';

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

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) showPreview(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) showPreview(fileInput.files[0]);
});

function showPreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    fileName.textContent = file.name;
    uploadPlaceholder.classList.add('hidden');
    imagePreview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

removeImage.addEventListener('click', (e) => {
  e.stopPropagation();
  clearImage();
});

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

function showError(input, errorEl) {
  input.classList.add('invalid');
  errorEl.classList.add('visible');
}

function clearError(input, errorEl) {
  input.classList.remove('invalid');
  errorEl.classList.remove('visible');
}

function validate() {
  let ok = true;
  if (!subjectInput.value.trim()) {
    showError(subjectInput, subjectError);
    ok = false;
  }
  return ok;
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

function hideToast() {
  toast.classList.add('hidden');
}

toastClose.addEventListener('click', hideToast);

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitLabel.textContent = loading ? 'Enviando...' : 'Enviar Ticket';
  const existing = submitBtn.querySelector('.spinner');
  if (loading && !existing) {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    submitBtn.insertBefore(spinner, submitBtn.firstChild);
    submitBtn.querySelector('svg').classList.add('hidden');
  } else if (!loading && existing) {
    existing.remove();
    submitBtn.querySelector('svg').classList.remove('hidden');
  }
}

async function getClientIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip;
  } catch {
    return 'desconocida';
  }
}

async function uploadImage(file) {
  const buffer = await file.arrayBuffer();
  const res = await fetch(`${REDMINE_URL}/uploads.json?filename=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: {
      'X-Redmine-API-Key': REDMINE_KEY,
      'Content-Type': 'application/octet-stream',
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Error al subir imagen: ${res.status}`);
  const data = await res.json();
  return data.upload.token;
}

async function sendTicket(subject, description, priorityId, imageToken, imageName) {
  const issue = {
    project_id: PROJECT_ID,
    subject: subject,
    description: description || '',
    priority_id: parseInt(priorityId),
  };

  if (imageToken) {
    issue.uploads = [{
      token: imageToken,
      filename: imageName,
      content_type: 'image/*',
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

  if (!res.ok) throw new Error(`Error al crear ticket: ${res.status}`);
  return await res.json();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validate()) return;

  setLoading(true);

  try {
    const ip = await getClientIP();
    const now = new Date().toLocaleString('es-HN');
    const subject = `"${subjectInput.value.trim()}" enviado el "${now}" desde la dirección "${ip}"`;
    const description = document.getElementById('description').value.trim();
    const priorityId = document.querySelector('input[name="priority"]:checked').value;

    let imageToken = null;
    let imageName = null;
    const file = fileInput.files[0];

    if (file) {
      imageToken = await uploadImage(file);
      imageName = file.name;
    }

    await sendTicket(subject, description, priorityId, imageToken, imageName);

    showToast('success', 'Ticket enviado', 'El ticket fue registrado correctamente en Redmine.');
    form.reset();
    clearImage();
    subjectCount.textContent = '0 / 120';

  } catch (err) {
    console.error(err);
    showToast('error', 'Error al enviar', err.message || 'No se pudo conectar con Redmine. Verifica tu API key y proyecto.');
  } finally {
    setLoading(false);
  }
});
