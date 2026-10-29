import { h, icon } from '/assets/js/ui.js';

export default async function render(box, ctx, info) {
  box.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', { text: info.title }))),
    h(
      'div',
      { class: 'card empty' },
      h('div', { class: 'ico' }, icon(info.icon)),
      h('h2', { text: 'Coming soon' }),
      h('p', { text: `${info.title} arrives in Stage ${info.stage}.` })
    )
  );
}
