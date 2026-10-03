"""Prepare CC0 source meshes for shared instancing. Run with Blender --background.
Sources live in ignored .model-sources; exported game files are original derived assets.
"""
import bpy, math, json, pathlib
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/world/grounded'
OUT.mkdir(parents=True,exist_ok=True)
reports=[]
for asset,target in [('island_tree_01',6000),('wine_barrel_01',900),('rock_09',700)]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'.model-sources'/asset/'source.gltf'))
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for o in objects:
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        # Separate material parts before reduction to keep bark and leaves intact.
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
        o.select_set(False)
    objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
    for o in objects:
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        before=sum(len(p.vertices)-2 for p in o.data.polygons)
        name=o.data.materials[0].name.lower() if len(o.data.materials) else ''
        budget=(18000 if 'leaves' in name else 900) if asset=='island_tree_01' else max(120,int(target*before/max(1,sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in objects))))
        if before>budget:
            modifier=o.modifiers.new('Game budget','DECIMATE');modifier.ratio=budget/before
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        o.select_set(False)
    # Centre X/Y and centre Z, normalize to dimensions used by existing emitters.
    points=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box]
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    dimensions=high-low;center=(low+high)*.5
    desired=Vector((4.5,4.5,6.5)) if asset=='island_tree_01' else Vector((1,1,1))
    factor=Vector(tuple(desired[i]/max(dimensions[i],.001) for i in range(3)))
    # Tree root stays at origin for felling; props remain centred.
    if asset=='island_tree_01':center.z=low.z
    for o in objects:
        for v in o.data.vertices:
            w=o.matrix_world@v.co
            v.co=Vector(tuple((w[i]-center[i])*factor[i] for i in range(3)))
        o.matrix_world.identity()
    for image in bpy.data.images:
        if image.type=='IMAGE' and image.size[0]>512:image.scale(512,512)
    for m in bpy.data.materials:
        if m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type=='BSDF_PRINCIPLED':
                    n.inputs['Metallic'].default_value=0
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(asset+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_animations=False)
    triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects)
    reports.append({'id':asset,'triangles':triangles,'bytes':(OUT/(asset+'.glb')).stat().st_size,'source':'https://polyhaven.com/a/'+asset,'license':'CC0-1.0','textureMax':512})
(OUT/'manifest.json').write_text(json.dumps(reports,indent=2))
print('Prepared models:',json.dumps(reports))
