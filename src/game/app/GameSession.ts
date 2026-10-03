import { Game } from './Game'
import type { WorldState } from '../model/WorldState'
import { deserializeWorld, SAVE_KEY, validateWorld } from '../persistence/SaveLoad'
import { StartScreen } from '../ui/StartScreen'

/** Owns the one active menu/game lifecycle. No simulation runs behind setup. */
export class GameSession {
  private game:Game|null=null
  private menu:StartScreen|null=null
  private suspended:WorldState|null=null
  constructor(private root:HTMLElement){}
  start():void{this.showMenu()}
  private showMenu(setup=false):void{
    this.game?.stop();this.game=null;this.menu?.dispose();this.root.replaceChildren()
    this.menu=new StartScreen(this.root,{
      continue:()=>{
        const text=localStorage.getItem(SAVE_KEY)
        const world=this.suspended??(text?deserializeWorld(text):null)
        if(!world)throw new Error('No saved settlement is available. Start a new settlement.')
        this.play(world)
      },
      start:world=>this.play(world),
    },!!this.suspended||!!localStorage.getItem(SAVE_KEY),setup)
  }
  private play(world:WorldState):void{
    validateWorld(world)
    this.menu?.dispose();this.menu=null;this.root.replaceChildren();this.suspended=null
    this.game=new Game(this.root,world,(state,setup)=>{
      this.suspended=state
      this.showMenu(setup)
    })
    this.game.start()
  }
}
