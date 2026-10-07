migrate((app) => {
  // PocketBase ships with an auth collection named "users" in fresh installs.
  // Configure it instead of attempting to create a duplicate collection.
  const users = app.findCollectionByNameOrId('users');
  users.listRule = 'id = @request.auth.id';
  users.viewRule = 'id = @request.auth.id';
  users.createRule = '';
  users.updateRule = 'id = @request.auth.id';
  users.deleteRule = null;
  users.passwordAuth = { enabled: true, identityFields: ['username'] };
  users.authToken.duration = 15552000;
  users.fields.add(new TextField({
    name: 'username',
    required: true,
    min: 3,
    max: 32,
    pattern: '^[a-z0-9_]+$',
  }));
  users.fields.getByName('email').required = false;
  users.indexes = [...users.indexes, 'CREATE UNIQUE INDEX idx_app_users_username ON users (username)'];
  app.save(users);

  const presets = new Collection({
    type: 'base',
    name: 'presets',
    listRule: 'visibility = "public" || (@request.auth.id != "" && owner = @request.auth.id)',
    viewRule: 'visibility = "public" || (@request.auth.id != "" && owner = @request.auth.id)',
    createRule: '@request.auth.id != "" && owner = @request.auth.id',
    updateRule: '@request.auth.id != "" && owner = @request.auth.id',
    deleteRule: '@request.auth.id != "" && owner = @request.auth.id',
    fields: [
      { type: 'relation', name: 'owner', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
      { type: 'text', name: 'name', required: true, min: 1, max: 128 },
      { type: 'text', name: 'description', max: 4096 },
      { type: 'json', name: 'payload', required: true, maxSize: 262144 },
      { type: 'number', name: 'schemaVersion', required: true, min: 1, max: 1 },
      { type: 'select', name: 'visibility', required: true, maxSelect: 1, values: ['private', 'public'] },
      { type: 'text', name: 'authorName', required: true, max: 32 },
      { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
      { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_presets_owner_updated ON presets (owner, updated DESC)',
      'CREATE INDEX idx_presets_visibility_updated ON presets (visibility, updated DESC)',
    ],
  });
  app.save(presets);
}, (app) => {
  const presets = app.findCollectionByNameOrId('presets');
  app.delete(presets);
  const users = app.findCollectionByNameOrId('users');
  users.listRule = null;
  users.viewRule = null;
  users.createRule = null;
  users.updateRule = null;
  users.passwordAuth = { enabled: true, identityFields: ['email'] };
  users.authToken.duration = 604800;
  users.fields.removeByName('username');
  users.fields.getByName('email').required = true;
  app.save(users);
});
