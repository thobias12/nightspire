// Development-only gallery. Exercise real art selectors at their actual sizes,
// without starting Three.js, mutating a settlement or constructing fake saves.
import '../src/style.css'
import '../src/game/ui/MedievalHud.css'
import '../src/game/ui/ManuscriptHud.css'
import '../src/game/ui/ArtFitQa.css'
import manifest from '../assets/ui/manuscript/manifest.json'
import { createHudTemplate } from '../src/game/ui/HudTemplate.ts'
import { catalogPreviewFor, decorateCatalogCards } from '../src/game/ui/HudCatalog.ts'
import { CURRENT_UI_ASSETS } from '../src/game/ui/UiAssets.ts'

const template = document.createElement('div')
template.innerHTML = createHudTemplate()
decorateCatalogCards(template)
document.querySelector('#art-fit-scenes').innerHTML = manifest.scenes.map(id => {
  const card = template.querySelector(`[data-art-slot="build-${id}"]`).closest('.build-card')
  const content = catalogPreviewFor(card)
  const group = card.closest('[data-build-panel]').dataset.buildPanel
  return `<section class="art-fit-row" data-art-group="${group}"><h2>${content.title}${content.planned ? ' · planned' : ''}</h2><div class="art-fit-surfaces">
    ${card.outerHTML}
    <aside class="build-preview is-visible"><div class="build-preview-heading"><b>${content.title}</b></div><div class="build-preview-art" data-art-slot="build-${id}"></div><div class="build-preview-copy"><p>${content.description}</p></div></aside>
    <div class="building-panel"><div class="building-panel-title"><span class="ui-icon-slot" data-ui-asset="building-icon:${id}"></span><h2>${content.title}</h2></div><div class="building-hero" data-ui-asset="building-header:${id}"></div><nav class="context-tabs"><button>General</button><button>People</button><button>Advanced</button></nav></div>
  </div></section>`
}).join('')
document.querySelector('.art-fit-people').innerHTML = manifest.portraits.map(id => `<figure><span class="portrait-slot" data-ui-asset="portrait:${id}"></span><span class="portrait-slot compact" data-ui-asset="portrait:${id}"></span><figcaption>${id}</figcaption></figure>`).join('')
const icons = [
  ...['resources', 'categories', 'services', 'notifications'].flatMap(group => CURRENT_UI_ASSETS[group].map(id => [group === 'resources' ? 'resource' : group === 'categories' ? 'category' : group === 'services' ? 'service' : 'notification', id, false])),
  ...CURRENT_UI_ASSETS.commands.map(id => ['command', id, true]),
  ...CURRENT_UI_ASSETS.utilityIcons.map(id => ['', id, true]),
]
document.querySelector('.art-fit-icons').innerHTML = icons.map(([group, id, slot]) => `<figure><span class="ui-icon-slot" ${slot ? `data-icon-slot="${group ? group + '-' : ''}${id}"` : `data-ui-asset="${group}:${id}"`}></span><figcaption>${id}</figcaption></figure>`).join('')
document.querySelector('#art-group').addEventListener('change', event => {
  const group = event.target.value
  document.querySelectorAll('.art-fit-row').forEach(row => { row.hidden = group !== 'all' && row.dataset.artGroup !== group })
  document.querySelector('#art-fit-portraits').hidden = group !== 'all' && group !== 'portraits'
})
document.querySelector('#art-layout').addEventListener('change', event => {
  document.querySelector('.art-fit-qa').classList.toggle('is-card-sheet', event.target.value === 'cards')
})
