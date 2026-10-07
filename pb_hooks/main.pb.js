onRecordCreateRequest((e) => {
  if (!e.auth) throw new ForbiddenError('Sign in to save presets.');
  const raw = JSON.stringify(e.record.get('payload'));
  if (!raw || raw.length > 262144) throw new BadRequestError('Preset payload exceeds 256 KB.');
  const payload = e.record.get('payload');
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.filters) || payload.filters.length > 64) {
    throw new BadRequestError('Preset payload is invalid.');
  }
  if (payload.name !== e.record.getString('name') || (payload.description || '') !== e.record.getString('description')) {
    throw new BadRequestError('Preset metadata does not match its payload.');
  }
  e.record.set('owner', e.auth.id);
  e.record.set('authorName', e.auth.getString('username'));
  e.record.set('visibility', e.record.getString('visibility') === 'public' ? 'public' : 'private');
  e.record.set('schemaVersion', 1);
  e.next();
}, 'presets');

onRecordUpdateRequest((e) => {
  if (!e.auth || e.record.getString('owner') !== e.auth.id) throw new ForbiddenError('Only the owner can update this preset.');
  const raw = JSON.stringify(e.record.get('payload'));
  if (!raw || raw.length > 262144) throw new BadRequestError('Preset payload exceeds 256 KB.');
  const payload = e.record.get('payload');
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
