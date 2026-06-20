const REDMINE_URL: string = 'URL REDMINE';
const REDMINE_KEY: string = 'API_KEY';
const PROJECT_ID: string = 'PROYECTO';

interface RedmineUpload {
  token: string;
  filename: string;
  content_type: string;
}

interface RedmineIssue {
  project_id: string;
  subject: string;
  description: string;
  priority_id: number;
  uploads?: RedmineUpload[];
}

interface UploadResponse {
  upload: { token: string };
}

const form = document.getElementById('ticketForm') as HTMLFormElement;
const subjectInput = document.getElementById('subject') as HTMLInputElement;
const subjectCount = document.getElementById('subjectCount') as HTMLSpanElement;
const subjectError = document.getElementById('subjectError') as HTMLSpanElement;
const uploadArea = document.getElementById('uploadArea') as HTMLDivElement;
const fileInput = document.getElementById('screenshot') as HTMLInputElement;
const uploadPlaceholder = document.getElementById('uploadPlaceholder') as HTMLDivElement;
const imagePreview = document.getElementById('imagePreview') as HTMLDivElement;
const previewImg = document.getElementById('previewImg') as HTMLImageElement;
const removeImage = document.getElementById('removeImage') as HTMLButtonElement;
const fileName = document.getElementById('fileName') as HTMLSpanElement;
const submitBtn = document.getElementById('submitBtn') as HTMLButtonElement;
const submitLabel = document.getElementById('submitLabel') as HTMLSpanElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const toast = document.getElementById('toast') as HTMLDivElement;
const toastTitle = document.getElementById('toastTitle') as HTMLElement;
const toastMessage = document.getElementById('toastMessage') as HTMLParagraphElement;
const toastIcon = document.getElementById('toastIcon') as HTMLDivElement;
const toastClose = document.getElementById('toastClose') as HTMLButtonElement;

subjectInput.addEventListener('input', (): void => {
  const len: number = subjectInput.value.length;
  subjectCount.textContent = `${len} / 120`;
  if (len > 0) clearError(subjectInput, subjectError);
});

uploadArea.addEventListener('click', (): void => fileInput.click());

uploadArea.addEventListener('dragover', (e: DragEvent): void => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', (): void => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e: DragEvent): void => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file: File | undefined = e.dataTransfer?.files[0];
  if (file && file.type.startsWith('image/')) showPreview(file);
});

fileInput.addEventListener('change', (): void => {
  if (fileInput.files?.[0]) showPreview(fileInput.files[0]);
});

function showPreview(file: File): void {
  const reader = new FileReader();
  reader.onload = (e: ProgressEvent<FileReader>): void => {
    previewImg.src = e.target?.result as string;
    fileName.textContent = file.name;
    uploadPlaceholder.classList.add('hidden');
    imagePreview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

removeImage.addEventListener('click', (e: MouseEvent): void => {
  e.stopPropagation();
  clearImage();
});

function clearImage(): void {
  fileInput.value = '';
  previewImg.src = '';
  fileName.textContent = '';
  imagePreview.classList.add('hidden');
  uploadPlaceholder.classList.remove('hidden');
}

resetBtn.addEventListener('click', (): void => {
  clearImage();
  subjectCount.textContent = '0 / 120';
  clearError(subjectInput, subjectError);
});

function showError(input: HTMLInputElement, errorEl: HTMLSpanElement): void {
  input.classList.add('invalid');
  errorEl.classList.add('visible');
}

function clearError(input: HTMLInputElement, errorEl: HTMLSpanElement): void {
  input.classList.remove('invalid');
  errorEl.classList.remove('visible');
}

function validate(): boolean {
  let ok = true;
  if (!subjectInput.value.trim()) {
    showError(subjectInput, subjectError);
    ok = false;
  }
  return ok;
}

let toastTimer: ReturnType<typeof setTimeout>;

function showToast(type: 'success' | 'error', title: string, message: string): void {
  clearTimeout(toastTimer);
  toastTitle.textContent = title;
  toastMessage.textContent = message;
  toastIcon.textContent = type === 'success' ? '✅' : '❌';
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast(): void {
  toast.classList.add('hidden');
}

toastClose.addEventListener('click', hideToast);

function setLoading(loading: boolean): void {
  submitBtn.disabled = loading;
  submitLabel.textContent = loading ? 'Enviando...' : 'Enviar Ticket';
  const existing = submitBtn.querySelector('.spinner');
  const icon = submitBtn.querySelector('svg') as SVGElement;
  if (loading && !existing) {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    submitBtn.insertBefore(spinner, submitBtn.firstChild);
    icon.classList.add('hidden');
  } else if (!loading && existing) {
    existing.remove();
    icon.classList.remove('hidden');
  }
}

async function getClientIP(): Promise<string> {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data: { ip: string } = await res.json();
    return data.ip;
  } catch {
    return 'desconocida';
  }
}

async function uploadImage(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const res = await fetch(
    `${REDMINE_URL}/uploads.json?filename=${encodeURIComponent(file.name)}`,
    {
      method: 'POST',
      headers: {
        'X-Redmine-API-Key': REDMINE_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    }
  );
  if (!res.ok) throw new Error(`Error al subir imagen: ${res.status}`);
  const data: UploadResponse = await res.json();
  return data.upload.token;
}

async function sendTicket(
  subject: string,
  description: string,
  priorityId: number,
  imageToken: string | null,
  imageName: string | null
): Promise<void> {
  const issue: RedmineIssue = {
    project_id: PROJECT_ID,
    subject: subject,
    description: description,
    priority_id: priorityId,
  };

  if (imageToken && imageName) {
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
}

form.addEventListener('submit', async (e: SubmitEvent): Promise<void> => {
  e.preventDefault();
  if (!validate()) return;

  setLoading(true);

  try {
    const ip: string = await getClientIP();
    const now: string = new Date().toLocaleString('es-HN');
    const subject: string = `"${subjectInput.value.trim()}" enviado el "${now}" desde la dirección "${ip}"`;
    const description: string = (document.getElementById('description') as HTMLTextAreaElement).value.trim();
    const priorityId: number = parseInt(
      (document.querySelector('input[name="priority"]:checked') as HTMLInputElement).value
    );

    let imageToken: string | null = null;
    let imageName: string | null = null;
    const file: File | undefined = fileInput.files?.[0];

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
    const error = err as Error;
    console.error(error);
    showToast('error', 'Error al enviar', error.message || 'No se pudo conectar con Redmine.');
  } finally {
    setLoading(false);
  }
});
