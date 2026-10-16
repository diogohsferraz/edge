/** Modelos de pipe e dados de demonstração. */

var PIPE_TEMPLATES = {
  compras: {
    name: 'Solicitações de compra', color: '#2a78d6',
    description: 'Do pedido à entrega: cotação, aprovação e compra.',
    startFields: [
      { id: 'f_item', label: 'O que precisa ser comprado?', type: 'text', required: true },
      { id: 'f_just', label: 'Justificativa', type: 'textarea', required: true },
      { id: 'f_email', label: 'E-mail do solicitante', type: 'email', required: true },
      { id: 'f_valor', label: 'Valor estimado', type: 'currency', required: false },
      { id: 'f_tipo', label: 'Tipo', type: 'select', options: ['Material de consumo', 'Equipamento', 'Serviço', 'Software'], required: true },
      { id: 'f_urg', label: 'Urgência', type: 'radio', options: ['Baixa', 'Média', 'Alta'], required: false }
    ],
    labels: [{ name: 'Urgente', color: '#e34948' }, { name: 'Recorrente', color: '#6250d6' }],
    phases: [
      { name: 'Caixa de entrada', slaHours: 24, fields: [] },
      { name: 'Cotação', slaHours: 72, fields: [
        { id: 'f_forn', label: 'Fornecedor escolhido', type: 'connection', tableId: '__fornecedores' },
        { id: 'f_cot', label: 'Cotações', type: 'attachment', required: true },
        { id: 'f_vfinal', label: 'Valor final', type: 'currency', required: true }
      ] },
      { name: 'Aprovação', slaHours: 48, fields: [
        { id: 'f_aprov', label: 'Aprovado?', type: 'radio', options: ['Sim', 'Não'], required: true },
        { id: 'f_obs', label: 'Observações da aprovação', type: 'textarea' }
      ] },
      { name: 'Compra realizada', slaHours: 120, fields: [
        { id: 'f_nf', label: 'Nota fiscal', type: 'attachment' },
        { id: 'f_entrega', label: 'Data de entrega', type: 'date' }
      ] },
      { name: 'Concluído', isDone: true, fields: [] },
      { name: 'Recusado', isDone: true, fields: [] }
    ]
  },
  reembolso: {
    name: 'Reembolsos', color: '#1baf7a',
    description: 'Pedidos de reembolso de despesas.',
    startFields: [
      { id: 'f_desc', label: 'Descrição da despesa', type: 'text', required: true },
      { id: 'f_email', label: 'E-mail do solicitante', type: 'email', required: true },
      { id: 'f_valor', label: 'Valor', type: 'currency', required: true },
      { id: 'f_data', label: 'Data da despesa', type: 'date', required: true },
      { id: 'f_comp', label: 'Comprovantes', type: 'attachment', required: false }
    ],
    labels: [],
    phases: [
      { name: 'Recebido', slaHours: 24, fields: [] },
      { name: 'Conferência', slaHours: 48, fields: [
        { id: 'f_check', label: 'Documentos conferidos', type: 'checklist', options: ['Nota fiscal', 'Comprovante de pagamento', 'Dados bancários'], required: true }
      ] },
      { name: 'Pagamento', slaHours: 72, fields: [{ id: 'f_pago', label: 'Data do pagamento', type: 'date', required: true }] },
      { name: 'Pago', isDone: true, fields: [] }
    ]
  },
  blank: {
    name: 'Novo pipe', color: '#6250d6', description: '',
    startFields: [{ id: 'f_titulo', label: 'Título', type: 'text', required: true }],
    labels: [],
    phases: [{ name: 'Caixa de entrada', fields: [] }, { name: 'Em andamento', fields: [] }, { name: 'Concluído', isDone: true, fields: [] }]
  }
};

function remapIds(fields, map) {
  return (fields || []).map(function (f) {
    var copy = JSON.parse(JSON.stringify(f));
    var nid = newId('f');
    map[f.id] = nid;
    copy.id = nid;
    if (copy.tableId && map[copy.tableId]) copy.tableId = map[copy.tableId];
    return copy;
  });
}

function createPipeFromTemplate(ctx, key, name, map) {
  var tpl = PIPE_TEMPLATES[key] || PIPE_TEMPLATES.blank;
  map = map || {};
  var pipe = Db.insert('pipes', {
    id: newId('p'), name: String(name || '').trim() || tpl.name, description: tpl.description, color: tpl.color,
    members: [], startFields: remapIds(tpl.startFields, map),
    labels: tpl.labels.map(function (l) { return { id: newId('l'), name: l.name, color: l.color }; }),
    publicForm: false, publicToken: newId('pf'), createdAt: nowIso(), createdBy: ctx.user.id, archived: false
  });
  var phases = tpl.phases.map(function (ph, i) {
    var fields = remapIds(ph.fields, map).map(function (f) {
      if (f.type === 'connection' && !Db.get('tables', f.tableId)) f.tableId = '';
      return f;
    });
    return Db.insert('phases', {
      id: newId('h'), pipeId: pipe.id, name: ph.name, order: i, fields: fields,
      slaHours: ph.slaHours || '', isDone: !!ph.isDone, description: ''
    });
  });
  return { pipe: pipe, phases: phases, map: map };
}

/** Cria uma database, dois pipes, automações e cards de exemplo. */
function seedDemo(ctx) {
  var forn = saveTable({
    name: 'Fornecedores', description: 'Cadastro de fornecedores homologados.',
    fields: [
      { id: 'tf_nome', label: 'Razão social', type: 'text', required: true },
      { id: 'tf_cnpj', label: 'CNPJ', type: 'text' },
      { id: 'tf_email', label: 'E-mail', type: 'email' },
      { id: 'tf_cat', label: 'Categoria', type: 'select', options: ['Material', 'Equipamento', 'Serviço', 'Software'] }
    ]
  });
  var fnames = [['Papelaria Central Ltda', '12.345.678/0001-90', 'vendas@papelariacentral.example', 'Material'],
    ['TecnoInfo Equipamentos', '98.765.432/0001-10', 'comercial@tecnoinfo.example', 'Equipamento'],
    ['Limpa Bem Serviços', '11.222.333/0001-44', 'contato@limpabem.example', 'Serviço']];
  var recs = fnames.map(function (f) {
    return saveRecord(ctx, { tableId: forn.id, values: { tf_nome: f[0], tf_cnpj: f[1], tf_email: f[2], tf_cat: f[3] } });
  });

  var map = { __fornecedores: forn.id };
  var compras = createPipeFromTemplate(ctx, 'compras', null, map);
  var cmap = JSON.parse(JSON.stringify(map));
  var reemb = createPipeFromTemplate(ctx, 'reembolso', null, {});
  Db.update('pipes', compras.pipe.id, { publicForm: true });

  var ph = compras.phases;
  saveAutomation({
    pipeId: compras.pipe.id, name: 'Urgência alta recebe etiqueta Urgente',
    trigger: { type: 'card_created' },
    conditions: [{ fieldId: cmap.f_urg, op: 'eq', value: 'Alta' }],
    actions: [{ type: 'add_label', labelId: compras.pipe.labels[0].id }]
  });
  saveAutomation({
    pipeId: compras.pipe.id, name: 'Recusar quando a aprovação for "Não"',
    trigger: { type: 'field_updated', fieldId: cmap.f_aprov },
    conditions: [{ fieldId: cmap.f_aprov, op: 'eq', value: 'Não' }],
    actions: [{ type: 'move_card', phaseId: ph[5].id }, { type: 'comment', text: 'Solicitação recusada na aprovação.' }]
  });
  saveAutomation({
    pipeId: compras.pipe.id, name: 'Avisar o solicitante quando concluir',
    trigger: { type: 'card_moved', phaseId: ph[4].id },
    conditions: [],
    actions: [{ type: 'send_email', to: '{{campo:E-mail do solicitante}}', subject: 'Sua compra foi concluída: {{titulo}}',
      body: 'Olá!\n\nA solicitação "{{titulo}}" chegou à fase {{fase}}.\n\nAcompanhe em: {{link}}' }]
  });
  saveAutomation({
    pipeId: compras.pipe.id, name: 'Comentar quando o SLA estourar',
    trigger: { type: 'sla_late' }, conditions: [],
    actions: [{ type: 'comment', text: 'Atenção: o card passou do prazo da fase {{fase}}.' }]
  });

  var samples = [
    ['Resma de papel A4 (50 un.)', 'Reposição do estoque do laboratório', 'Material de consumo', 'Média', 1250, 0, -30],
    ['Notebook para bolsista', 'Novo bolsista do projeto de visão computacional', 'Equipamento', 'Alta', 6500, 1, -20],
    ['Licença de software estatístico', 'Análises do relatório anual', 'Software', 'Baixa', 3200, 2, -12],
    ['Manutenção do ar-condicionado', 'Sala de servidores aquecendo', 'Serviço', 'Alta', 900, 3, -9],
    ['Cabos HDMI (10 un.)', 'Salas de reunião', 'Material de consumo', 'Baixa', 300, 4, -6],
    ['Monitor 27"', 'Estação de trabalho de design', 'Equipamento', 'Média', 1800, 0, -3],
    ['Cadeiras ergonômicas', 'Ergonomia da equipe', 'Equipamento', 'Média', 4200, 1, -2]
  ];
  samples.forEach(function (s) {
    var values = {};
    values[cmap.f_item] = s[0]; values[cmap.f_just] = s[1]; values[cmap.f_tipo] = s[2];
    values[cmap.f_urg] = s[3]; values[cmap.f_valor] = s[4]; values[cmap.f_email] = ctx.user.email;
    var card = createCard(ctx, compras.pipe.id, values, { assignees: [ctx.user.id] });
    // Ajusta datas para os relatórios terem histórico.
    var created = new Date(Date.now() + s[6] * 86400000);
    var history = [];
    var t = created.getTime();
    for (var i = 0; i <= s[5]; i++) {
      var entered = new Date(t).toISOString();
      t += (1 + i) * 86400000 * 0.4;
      history.push({ phaseId: ph[i].id, enteredAt: entered, leftAt: i < s[5] ? new Date(t).toISOString() : null });
    }
    if (s[5] >= 2) { values[cmap.f_vfinal] = s[4] * 0.95; values[cmap.f_forn] = [recs[s[5] % 3].id]; }
    if (s[5] >= 3) values[cmap.f_aprov] = 'Sim';
    Db.update('cards', card.id, {
      phaseId: ph[s[5]].id, history: history, values: values, createdAt: created.toISOString(),
      phaseEnteredAt: history[history.length - 1].enteredAt,
      doneAt: s[5] === 4 ? history[history.length - 1].enteredAt : '',
      dueDate: s[5] < 4 ? new Date(Date.now() + (s[6] + 10) * 86400000).toISOString().slice(0, 10) : ''
    });
  });

  var rv = {};
  rv[reemb.map.f_desc] = 'Táxi para evento na UFAL';
  rv[reemb.map.f_email] = ctx.user.email;
  rv[reemb.map.f_valor] = 85.5;
  rv[reemb.map.f_data] = new Date().toISOString().slice(0, 10);
  createCard(ctx, reemb.pipe.id, rv, {});
  return { pipes: [compras.pipe.id, reemb.pipe.id], table: forn.id };
}
