onRecordCreateRequest((e) => {
  if (!e.auth) throw new ForbiddenError('Sign in to save presets.');
  let payload;
  try {
    payload = JSON.parse(e.record.getString('payload'));
  } catch {
    throw new BadRequestError('Preset payload is invalid.');
  }
  const raw = JSON.stringify(payload);
  if (!raw || raw.length > 262144) throw new BadRequestError('Preset payload exceeds 256 KB.');
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.filters) || payload.filters.length > 64) {
    throw new BadRequestError('Preset payload is invalid.');
  }
  if (payload.name !== e.record.getString('name') || (payload.description || '') !== e.record.getString('description')) {
    throw new BadRequestError('Preset metadata does not match its payload.');
  }

  // If superuser is creating the record on behalf of a user
  const isSuperuser = e.auth.collection().name === '_superusers';
  if (!isSuperuser) {
    e.record.set('owner', e.auth.id);
    e.record.set('authorName', e.auth.getString('username'));
  }
  e.record.set('visibility', e.record.getString('visibility') === 'public' ? 'public' : 'private');
  e.record.set('schemaVersion', 1);
  e.next();
}, 'presets');

onRecordUpdateRequest((e) => {
  if (!e.auth || e.record.getString('owner') !== e.auth.id) throw new ForbiddenError('Only the owner can update this preset.');
  let payload;
  try {
    payload = JSON.parse(e.record.getString('payload'));
  } catch {
    throw new BadRequestError('Preset payload is invalid.');
  }
  const raw = JSON.stringify(payload);
  if (!raw || raw.length > 262144) throw new BadRequestError('Preset payload exceeds 256 KB.');
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.filters) || payload.filters.length > 64) {
    throw new BadRequestError('Preset payload is invalid.');
  }
  if (payload.name !== e.record.getString('name') || (payload.description || '') !== e.record.getString('description')) {
    throw new BadRequestError('Preset metadata does not match its payload.');
  }
  e.record.set('owner', e.auth.id);
  e.record.set('authorName', e.auth.getString('username'));
  e.record.set('schemaVersion', 1);
  e.next();
}, 'presets');
