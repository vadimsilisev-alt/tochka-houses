export function setupApplicationForm(dialog) {
  const form = dialog.querySelector('#application-form');
  if (!form) return;
  const fields = Object.fromEntries(['name', 'phone', 'comment'].map((name) => [name, form.elements.namedItem(name)]));
  const submit = form.querySelector('[type="submit"]');
  const status = form.querySelector('#application-status');
  const notice = form.querySelector('#application-notice');
  const destinations = Object.freeze(Object.assign(Object.create(null), {
    telegram: { endpoint: '/api/application',
      notice: 'Имя, телефон и сообщение будут переданы компании через Telegram.',
      success: 'Заявка отправлена в Telegram.' },
    sheets: { endpoint: '/api/application/sheets',
      notice: 'Имя, телефон и сообщение будут записаны в Google-таблицу компании.',
      success: 'Заявка записана в Google-таблицу.' },
  }));
  let destination = 'telegram';
  let destinationReady = true;
  let pending = false;
  submit.disabled = false;
  dialog.querySelector('[data-close-discussion]').addEventListener('click', () => dialog.close());

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  }
  function markErrors(errors) {
    Object.entries(fields).forEach(([name, field]) => {
      const message = errors[name] || '';
      const error = form.querySelector(`#${name}-error`);
      error.textContent = message;
      error.hidden = !message;
      field.setAttribute('aria-invalid', String(Boolean(message)));
    });
    const first = Object.keys(fields).find((name) => errors[name]);
    if (first && dialog.open) fields[first].focus();
  }
  function validate(values) {
    const errors = {};
    if (values.name.length < 2 || values.name.length > 80 || /[\u0000-\u001f\u007f]/u.test(values.name)) errors.name = 'Введите имя от 2 до 80 символов.';
    const digits = values.phone.replace(/\D/g, '');
    if (!/^\+?[\d\s().-]+$/u.test(values.phone) || digits.length < 10 || digits.length > 15 || /[\r\n]/u.test(values.phone)) errors.phone = 'Введите телефон: от 10 до 15 цифр.';
    if (values.comment.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(values.comment)) errors.comment = 'Сообщение должно быть не длиннее 2000 символов.';
    return errors;
  }
  form.addEventListener('input', (event) => {
    if (pending) return;
    const field = event.target;
    if (field.name in fields) {
      field.setAttribute('aria-invalid', 'false');
      form.querySelector(`#${field.name}-error`).hidden = true;
    }
    if (!destinationReady) setStatus('Запись заявок в Google-таблицу пока недоступна.', 'error');
    else setStatus('', '');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    const values = Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, field.value.trim()]));
    values.comment = values.comment.replace(/\r\n?/g, '\n');
    const errors = validate(values);
    markErrors(errors);
    if (Object.keys(errors).length) {
      setStatus('Проверьте отмеченные поля.', 'error');
      return;
    }
    const target = destinations[destination];
    if (!target || !destinationReady) { setStatus(destination === 'sheets' ? 'Запись заявок в Google-таблицу пока недоступна.' : 'Отправка заявок пока недоступна. Попробуйте позже.', 'error'); return; }
    // Snapshot this request's target. Closing/reopening from another CTA while
    // pending must never route the same application to a different service.
    const requestDestination = destination;
    pending = true;
    submit.disabled = true;
    Object.values(fields).forEach((field) => { field.readOnly = true; });
    form.setAttribute('aria-busy', 'true');
    submit.firstChild.textContent = 'Отправляем…';
    setStatus('Отправляем заявку…', 'pending');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(target.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify(values), signal: controller.signal,
      });
      const payload = await response.json();
      const confirmedDestination = requestDestination === 'telegram'
        ? !payload.destination || payload.destination === 'telegram'
        : payload.destination === 'sheets';
      if (response.ok && payload.ok === true && confirmedDestination) {
        form.reset();
        markErrors({});
        setStatus(target.success, 'success');
        if (dialog.open) status.focus({ preventScroll: true });
      } else if (response.status === 422) {
        const serverErrors = {};
        // Use our own allowlisted copy; do not display arbitrary server strings.
        if (payload.fields?.name) serverErrors.name = 'Введите имя от 2 до 80 символов.';
        if (payload.fields?.phone) serverErrors.phone = 'Введите телефон: от 10 до 15 цифр.';
        if (payload.fields?.comment) serverErrors.comment = 'Сообщение должно быть не длиннее 2000 символов.';
        markErrors(serverErrors);
        setStatus('Проверьте отмеченные поля.', 'error');
      } else {
        const message = response.status === 429 ? 'Слишком много заявок. Попробуйте через минуту.'
          : response.status === 503 ? 'Отправка заявок пока недоступна. Попробуйте позже.'
          : payload.code === 'DELIVERY_FAILED' ? 'Не удалось отправить заявку. Попробуйте позже.'
          : 'Не удалось подтвердить отправку. Попробуйте позже';
        setStatus(message, 'error');
      }
    } catch {
      setStatus('Не удалось подтвердить отправку. Попробуйте позже', 'error');
    } finally {
      clearTimeout(timer);
      pending = false;
      submit.disabled = false;
      Object.values(fields).forEach((field) => { field.readOnly = false; });
      form.setAttribute('aria-busy', 'false');
      submit.firstChild.textContent = 'Отправить заявку';
    }
  });
  return { prepareOpen(trigger) {
    if (pending) return;
    const next = trigger.dataset.applicationDestination || 'telegram';
    if (next !== destination) { setStatus('', ''); markErrors({}); }
    destination = next;
    destinationReady = trigger.dataset.applicationReady !== 'false';
    form.dataset.destination = destination;
    submit.disabled = !destinations[destination] || !destinationReady;
    if (destinations[destination] && notice) notice.textContent = destinations[destination].notice;
    else setStatus('Отправка заявок пока недоступна. Попробуйте позже.', 'error');
    if (!destinationReady) setStatus('Запись заявок в Google-таблицу пока недоступна.', 'error');
  } };
}
