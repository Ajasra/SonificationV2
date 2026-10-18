migrate((app) => {
  const users = app.findCollectionByNameOrId('users');
  users.fields.add(new SelectField({
    name: 'language',
    required: false,
    maxSelect: 1,
    values: ['en', 'zh-CN'],
  }));
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId('users');
  users.fields.removeByName('language');
  app.save(users);
});
