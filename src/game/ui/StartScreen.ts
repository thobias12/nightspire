import { LANDSCAPES, MAP_SIZES, type Landscape, type MapSize } from '../data/map'
import { createGeneratedWorld } from '../world/MapGenerator'
import type { WorldState } from '../model/WorldState'
import { mapIllustration } from './MapIllustration'
import './StartScreen.css'

export interface StartScreenActions { continue(): void; start(world: WorldState): void }
/** Owns menu DOM only. Preview generation occurs on settings changes, not frames. */
export class StartScreen {
  private readonly abort=new AbortController()
  private preview: WorldState | null=null
  private settings={seed:137,size:513 as MapSize,landscape:'meadows' as Landscape}
  constructor(private root:HTMLElement,private actions:StartScreenActions,private canContinue:boolean,setup=false){
    root.className='start-screen'
    root.addEventListener('click',event=>{
      const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-menu]')
      if(!button)return
      try{
        switch(button.dataset.menu){
          case 'continue':this.actions.continue();break
          case 'new':this.setup();break
          case 'back':this.home();break
          case 'reroll':
            this.root.querySelector<HTMLInputElement>('#setup-seed')!.value=String(crypto.getRandomValues(new Uint32Array(1))[0]);this.refresh();break
          case 'begin':if(this.preview)this.actions.start(this.preview);break
        }
      }catch(error){this.error(error)}
    },{signal:this.abort.signal})
    root.addEventListener('change',()=>this.refresh(),{signal:this.abort.signal})
    setup?this.setup():this.home()
  }
  private home():void{
    this.root.innerHTML='<div class="menu-vignette"></div><main class="menu-home"><span class="menu-eyebrow">A SETTLEMENT IN THE WILDS</span><h1>NIGHTSPIRE</h1><div class="menu-flourish">✦</div>'
      +(this.canContinue?'<button data-menu="continue">Continue settlement</button>':'')
      +'<button data-menu="new">New settlement</button><p>Choose your landscape. Make a place worth defending.</p><div class="menu-error" role="status"></div></main>'
  }
  private setup():void{
    this.root.innerHTML='<header class="setup-title"><span>✦</span><h1>Game Setup</h1><span>✦</span></header><main class="setup-columns"><section class="setup-panel setup-settings"><h2>Settlement</h2><div class="setup-scenario"><div></div><h3>A New Beginning</h3><p>Six settlers, a camp clearing and untamed land. Build by day; defend your settlement at night.</p></div><h2>Landscape</h2><label>Map selection<select id="setup-landscape" aria-label="Map selection">'
      +Object.entries(LANDSCAPES).map(([id,config])=>'<option value="'+id+'"'+(id===this.settings.landscape?' selected':'')+'>'+config.name+' · '+config.subtitle+'</option>').join('')
      +'</select></label><p id="setup-description"></p><label>Playable area<select id="setup-size" aria-label="Playable area">'
      +MAP_SIZES.map(size=>'<option value="'+size+'"'+(size===this.settings.size?' selected':'')+'>'+size+' × '+size+' metres'+(size===513?' · Large':size===257?' · Medium':' · Small')+'</option>').join('')
      +'</select></label><label>Map seed<div class="setup-seed-row"><input id="setup-seed" aria-label="Map seed" type="number" min="0" max="4294967295" step="1" value="'+this.settings.seed+'"><button data-menu="reroll" title="Generate a different seed">Reroll</button></div></label><dl id="setup-facts"></dl><p class="setup-note">Every seed has nearby timber, food and ore. Resource locations and woodland shapes vary. The normal population limit remains ten.</p></section><section class="setup-panel setup-map"><h2>Map Selection</h2><div id="setup-map-art"></div><div class="atlas-legend"><span>♧ Woodland</span><span>● Food</span><span>◆ Ore</span><span>△ Camp</span><span>≈ Water / fords</span></div><div class="menu-error" role="status"></div></section></main><footer class="setup-footer"><button data-menu="back">Return</button><span>Fresh starts · same seed, same landscape</span><button class="setup-begin" data-menu="begin">Begin settlement</button></footer>'
    this.refresh()
  }
  private refresh():void{
    const seed=this.root.querySelector<HTMLInputElement>('#setup-seed')
    if(!seed)return
    try{
      if(seed.value.trim()==='')throw new Error('Enter a whole-number seed from 0 to 4294967295.')
      const settings={seed:Number(seed.value),size:Number(this.root.querySelector<HTMLSelectElement>('#setup-size')!.value) as MapSize,landscape:this.root.querySelector<HTMLSelectElement>('#setup-landscape')!.value as Landscape}
      const world=createGeneratedWorld(settings.seed,settings.size,settings.landscape,2)
      this.settings=settings;this.preview=world
      this.root.querySelector('#setup-map-art')!.innerHTML=mapIllustration(world)
      this.root.querySelector('#setup-description')!.textContent=LANDSCAPES[settings.landscape].description
      this.root.querySelector('#setup-facts')!.innerHTML='<dt>World</dt><dd>'+settings.size+' × '+settings.size+' m</dd><dt>Wood stands</dt><dd>'+world.nodes.filter(n=>n.resource==='wood').length+'</dd><dt>Food patches</dt><dd>'+world.nodes.filter(n=>n.resource==='food').length+'</dd><dt>Ore nodes</dt><dd>'+world.nodes.filter(n=>n.resource==='ore').length+'</dd>'
      this.root.querySelector<HTMLButtonElement>('[data-menu="begin"]')!.disabled=false
      this.root.querySelector('.menu-error')!.textContent=''
    }catch(error){this.preview=null;this.root.querySelector<HTMLButtonElement>('[data-menu="begin"]')!.disabled=true;this.error(error)}
  }
  private error(error:unknown):void{this.root.querySelector('.menu-error')!.textContent=error instanceof Error?error.message:'Could not start settlement.'}
  dispose():void{this.abort.abort()}
}
