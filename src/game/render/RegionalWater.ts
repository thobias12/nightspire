import * as THREE from 'three'
import type { MapDefinition } from '../data/map'
import { isFord, mapLakes, riverCenter, riverWidth } from '../world/MapTerrain'

/** One opaque shared surface, bounded independently of map area/population. */
export function waterSurfacePositions(map?:MapDefinition):Float32Array{
  const p:number[]=[]
  if(!map||map.version!==2)return new Float32Array()
  const h=(map.size-1)/2,y=0.035
  if(map.landscape==='riverlands'){
    const width=riverWidth(map)
    for(let i=0;i<256;i++){
      const a=-h+i/256*h*2,b=-h+(i+1)/256*h*2
      if(isFord(a,map)||isFord(b,map)||isFord((a+b)/2,map))continue
      const ax=riverCenter(a,map),bx=riverCenter(b,map)
      p.push(ax-width,y,a,bx-width,y,b,ax+width,y,a,ax+width,y,a,bx-width,y,b,bx+width,y,b)
    }
  }
  for(const lake of mapLakes(map)){
    const point=(t:number):[number,number]=>{
      const r=1+Math.sin(t*3+lake.angle)*0.07,u=Math.cos(t)*lake.rx*r,v=Math.sin(t)*lake.rz*r
      return [lake.x+u*Math.cos(lake.angle)-v*Math.sin(lake.angle),lake.z+u*Math.sin(lake.angle)+v*Math.cos(lake.angle)]
    }
    for(let i=0;i<96;i++){
      const [ax,az]=point(i/96*Math.PI*2),[bx,bz]=point((i+1)/96*Math.PI*2)
      p.push(lake.x,y,lake.z,bx,y,bz,ax,y,az)
    }
  }
  return new Float32Array(p)
}
export class RegionalWater extends THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>{
  private key=''
  constructor(){
    super(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({color:0x688b92,roughness:0.38,metalness:0.08}))
    this.visible=false
  }
  update(map?:MapDefinition):void{
    const key=JSON.stringify(map)??''
    if(key===this.key)return
    this.key=key;this.geometry.dispose();this.geometry=new THREE.BufferGeometry()
    const positions=waterSurfacePositions(map)
    this.geometry.setAttribute('position',new THREE.BufferAttribute(positions,3))
    this.geometry.computeVertexNormals();this.geometry.computeBoundingSphere();this.visible=positions.length>0
  }
}
