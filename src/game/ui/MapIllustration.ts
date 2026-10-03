import type { WorldState } from '../model/WorldState'
import { forestDensity, mapHash } from '../world/MapGenerator'
import { mapLakes, riverCenter, riverFords, riverWidth } from '../world/MapTerrain'

/** Original cartography from the same seed/world as gameplay; bounded static work. */
export function mapIllustration(world: WorldState): string {
  const map=world.map
  if(!map) return ''
  const h=(map.size-1)/2, scale=560/(h*2), px=(x:number)=>20+(x+h)*scale
  const fmt=(v:number)=>v.toFixed(2), n=64, step=map.size/n
  const values=Array.from({length:n+1},(_,z)=>Array.from({length:n+1},(_,x)=>
    x===0||z===0||x===n||z===n?0:forestDensity(-h+x*step,-h+z*step,map)))
  // Marching squares with shared edge endpoints; closed contours avoid tile seams.
  const paths=(threshold:number):string=>{
    const edges=new Map<string,string[]>(),coords=new Map<string,[number,number]>()
    const link=(a:[number,number],b:[number,number])=>{
      const ak=a.map(v=>v.toFixed(3)).join(','),bk=b.map(v=>v.toFixed(3)).join(',')
      coords.set(ak,a);coords.set(bk,b)
      edges.set(ak,[...(edges.get(ak)??[]),bk]);edges.set(bk,[...(edges.get(bk)??[]),ak])
    }
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){
      const corners=[[x,z],[x+1,z],[x+1,z+1],[x,z+1]]
      const crossings:[number,number][]=[]
      for(let i=0;i<4;i++){
        const [ax,az]=corners[i],[bx,bz]=corners[(i+1)%4],a=values[az][ax],b=values[bz][bx]
        if((a>threshold)===(b>threshold))continue
        const t=(threshold-a)/(b-a)
        crossings.push([ax+(bx-ax)*t,az+(bz-az)*t])
      }
      for(let i=1;i<crossings.length;i+=2)link(crossings[i-1],crossings[i])
    }
    let result=''
    const visited=new Set<string>()
    for(const start of edges.keys()){
      if(visited.has(start))continue
      let current=start,previous='',path=''
      for(let count=0;count<edges.size+1;count++){
        visited.add(current);const [x,z]=coords.get(current)!
        path+=(count?'L':'M')+fmt(px(-h+x*step))+','+fmt(px(-h+z*step))
        const next=edges.get(current)!.find(key=>key!==previous)
        if(!next||next===start){path+='Z';break}
        previous=current;current=next
        if(visited.has(current))break
      }
      result+=path
    }
    return result
  }
  let water='',fords=''
  if(map.version===2&&map.landscape==='riverlands'){
    let line=''
    for(let i=0;i<=180;i++){const z=-h+i/180*h*2;line+=(i?'L':'M')+fmt(px(riverCenter(z,map)))+','+fmt(px(z))}
    water='<path d="'+line+'" fill="none" stroke="#9b9983" stroke-width="'+fmt((riverWidth(map)*2+4)*scale)+'"/><path d="'+line+'" fill="none" stroke="#71909a" stroke-width="'+fmt(riverWidth(map)*2*scale)+'"/>'
    for(const z of riverFords(map))fords+='<path d="M'+fmt(px(riverCenter(z,map))-7)+','+fmt(px(z))+'h14" stroke="#dacba4" stroke-width="4"/><circle cx="'+fmt(px(riverCenter(z,map)))+'" cy="'+fmt(px(z))+'" r="5" fill="none" stroke="#4c463a"/>'
  }
  for(const lake of mapLakes(map)){
    let line=''
    for(let i=0;i<=72;i++){
      const t=i/72*Math.PI*2,r=1+Math.sin(t*3+lake.angle)*0.07,u=Math.cos(t)*lake.rx*r,v=Math.sin(t)*lake.rz*r
      line+=(i?'L':'M')+fmt(px(lake.x+u*Math.cos(lake.angle)-v*Math.sin(lake.angle)))+','+fmt(px(lake.z+u*Math.sin(lake.angle)+v*Math.cos(lake.angle)))
    }
    water+='<path d="'+line+'Z" fill="#80999d" stroke="#9b9983" stroke-width="3"/>'
  }
  let trees='',marks=''
  for(let i=0;i<420;i++){
    const x=(mapHash(i,31,map.seed)*2-1)*h,z=(mapHash(i,33,map.seed)*2-1)*h
    if(forestDensity(x,z,map)<0.45)continue
    const a=px(x),b=px(z)
    trees+='<path d="M'+fmt(a)+','+fmt(b+3)+'v-5m-3,2l3-7 3,7Z" fill="#827f63" fill-opacity=".28" stroke="#676a51" stroke-opacity=".4" stroke-width=".65"/>'
  }
  const deposits=new Map<string,{x:number;z:number;resource:string;count:number}>()
  for(const node of world.nodes){
    if(node.resource==='wood'||node.remaining<=0)continue
    const key=node.resource+':'+Math.round(node.x/18)+':'+Math.round(node.z/18),old=deposits.get(key)
    if(old){old.x+=node.x;old.z+=node.z;old.count++}else deposits.set(key,{x:node.x,z:node.z,resource:node.resource,count:1})
  }
  for(const group of [...deposits.values()].slice(0,64)){
    const x=px(group.x/group.count),z=px(group.z/group.count),food=group.resource==='food'
    marks+='<g transform="translate('+fmt(x)+' '+fmt(z)+')"><title>'+group.resource+' deposit</title><circle r="8" fill="#e2d3ac" stroke="#625849"/>'+(food?'<path d="M-3,4L0,-5 3,4Z" fill="#6c754c"/><circle r="2" fill="#a06d55"/>':'<path d="M-5,3L-2,-4 3,-3 5,3Z" fill="#747778" stroke="#514f48"/>')+'</g>'
  }
  return '<svg class="region-atlas" viewBox="0 0 600 600" role="img" aria-label="Generated map: woodland, water, resource deposits and starting camp" xmlns="http://www.w3.org/2000/svg">'
    +'<rect width="600" height="600" fill="#c7b68c"/><rect x="12" y="12" width="576" height="576" fill="#ddd0aa" stroke="#625845" stroke-width="2"/><path d="'+paths(0.2)+'" fill="#96987b" fill-opacity=".4"/><path d="'+paths(0.6)+'" fill="#777d61" fill-opacity=".25"/>'
    +water+trees+marks+fords+'<g transform="translate(300 300)"><circle r="18" fill="#eadcba" stroke="#9b684e" stroke-width="2"/><path d="M-10,7L0,-10 10,7ZM0,-10V7" fill="#655f47" stroke="#eedfbd" stroke-width="1.5"/><text y="34" text-anchor="middle" fill="#4b4438" font-size="13" font-family="Georgia">Starting camp</text></g>'
    +'<g transform="translate(550 51)"><path d="M0,-19L5,0 0,15 -5,0Z" fill="#6a624e"/><path d="M-15,0H15M0,-19V15" stroke="#6a624e"/><text y="-23" text-anchor="middle" font-size="13" fill="#4b4438">N</text></g><path d="M36,556h80m-80,-4v8m80,-8v8" stroke="#514938"/><text x="76" y="548" text-anchor="middle" font-size="11" fill="#514938">'+Math.round(80/scale)+' metres</text></svg>'
}
