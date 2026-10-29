import { h, icon, greeting } from '/assets/js/ui.js';

const STATS = ['This month', 'GST this month', 'Bills this month', 'This financial year'];

export default async function render(box, ctx) {
  const name = ctx.me.firmName || 'Zaitun Engineers';
  box.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', { text: greeting() }), h('p', { class: 'sub', text: name }))),
    h(
      'div',
      { class: 'stats' },
      STATS.map((label) =>
        h('div', { class: 'card stat' }, h('div', { class: 'label', text: label }), h('div', { class: 'value', text: '—' }), h('div', { class: 'cap', text: 'Live from Stage 6' }))
      )
    )
  );
  if (!ctx.me.firmName) {
    box.append(
      h(
        'div',
        { class: 'card empty' },
        h('div', { class: 'ico' }, icon('building')),
        h('h2', { text: 'Start by filling your firm details' }),
        h('p', { text: 'Your firm name, GSTIN, address and bank details print on every bill and decide which GST applies.' }),
        h('a', { class: 'btn btn-primary', href: '#/settings/firm' }, 'Fill firm details')
      )
    );
  }
}
