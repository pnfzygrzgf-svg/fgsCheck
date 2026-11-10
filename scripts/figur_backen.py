# Backt eine skinnte, animierte glTF-Figur (FBX2glTF) in eine statische Figur: Pose = erste Keyframes der gewählten Animation,
# lineare Blend-Skinning-Rechnung je Vertex, Ergebnis ohne Skin/Animation, Knoten ohne Transform (Welt der Datei).
import json,struct,sys,math
src,dst,animName=sys.argv[1],sys.argv[2],sys.argv[3]
b=open(src,'rb').read(); clen,ctype=struct.unpack('<II',b[12:20]); j=json.loads(b[20:20+clen])
off=20+clen; blen,btype=struct.unpack('<II',b[off:off+8]); BIN=b[off+8:off+8+blen]
CT={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def acc(i):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; fmt,sz=CT[a['componentType']]; n=NC[a['type']]
    start=bv.get('byteOffset',0)+a.get('byteOffset',0); stride=bv.get('byteStride',sz*n); out=[]
    for k in range(a['count']):
        o=start+k*stride; v=struct.unpack('<'+fmt*n,BIN[o:o+sz*n])
        if a.get('normalized'): v=tuple(x/255 if fmt=='B' else x/65535 for x in v)
        out.append(v)
    return out
# Matrizen 4x4 als Zeilenlisten (row-major)
def mat_trs(t,r,s):
    x,y,z,w=r; xx,yy,zz=x*x,y*y,z*z; xy,xz,yz,wx,wy,wz=x*y,x*z,y*z,w*x,w*y,w*z
    R=[[1-2*(yy+zz),2*(xy-wz),2*(xz+wy)],[2*(xy+wz),1-2*(xx+zz),2*(yz-wx)],[2*(xz-wy),2*(yz+wx),1-2*(xx+yy)]]
    return [[R[0][0]*s[0],R[0][1]*s[1],R[0][2]*s[2],t[0]],[R[1][0]*s[0],R[1][1]*s[1],R[1][2]*s[2],t[1]],[R[2][0]*s[0],R[2][1]*s[1],R[2][2]*s[2],t[2]],[0,0,0,1]]
def mul(A,B): return [[sum(A[i][k]*B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def colmajor(m16): return [[m16[c*4+r] for c in range(4)] for r in range(4)]
def apply(M,p,w=1.0): return [M[i][0]*p[0]+M[i][1]*p[1]+M[i][2]*p[2]+M[i][3]*w for i in range(3)]
nodes=j['nodes']
# Pose aus der Animation: erste Keyframes
pose={}
anim=next(a for a in j.get('animations',[]) if a.get('name')==animName)
for ch in anim['channels']:
    s=anim['samplers'][ch['sampler']]; out=acc(s['output']); tgt=ch['target']; n=tgt['node']
    pose.setdefault(n,{})[tgt['path']]=out[0]
def local(i):
    n=nodes[i]; p=pose.get(i,{})
    if 'matrix' in n and not p: return colmajor(n['matrix'])
    t=p.get('translation',n.get('translation',[0,0,0])); r=p.get('rotation',n.get('rotation',[0,0,0,1])); s=p.get('scale',n.get('scale',[1,1,1]))
    return mat_trs(t,r,s)
glob={}
def walk(i,parent):
    glob[i]=mul(parent,local(i))
    for c in nodes[i].get('children',[]): walk(c,glob[i])
I4=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
for r in j['scenes'][0]['nodes']: walk(r,I4)
skin=j['skins'][0]; ibm=[colmajor(m) for m in acc(skin['inverseBindMatrices'])]
JM=[mul(glob[jn],ibm[k]) for k,jn in enumerate(skin['joints'])]
meshNode=next(i for i,n in enumerate(nodes) if 'skin' in n)
mesh=j['meshes'][nodes[meshNode]['mesh']]
newbin=bytearray(BIN); newviews=j['bufferViews']; newacc=j['accessors']
def addAccessor(vals,n=3):
    global newbin
    while len(newbin)%4: newbin+=b'\0'
    start=len(newbin)
    for v in vals: newbin+=struct.pack('<'+'f'*n,*v)
    newviews.append({'buffer':0,'byteOffset':start,'byteLength':len(newbin)-start})
    mn=[min(v[k] for v in vals) for k in range(n)]; mx=[max(v[k] for v in vals) for k in range(n)]
    newacc.append({'bufferView':len(newviews)-1,'componentType':5126,'count':len(vals),'type':'VEC3' if n==3 else 'VEC2','min':mn,'max':mx})
    return len(newacc)-1
allmin=[1e9]*3; allmax=[-1e9]*3
for pr in mesh['primitives']:
    at=pr['attributes']; P=acc(at['POSITION']); N=acc(at['NORMAL']) if 'NORMAL' in at else None
    J=acc(at['JOINTS_0']); W=acc(at['WEIGHTS_0'])
    outP=[];outN=[]
    for k,p in enumerate(P):
        q=[0,0,0]; nn=[0,0,0]
        for jj,ww in zip(J[k],W[k]):
            if ww==0: continue
            M=JM[int(jj)]; a=apply(M,p)
            for d in range(3): q[d]+=ww*a[d]
            if N: nb=apply(M,N[k],0.0)
            if N:
                for d in range(3): nn[d]+=ww*nb[d]
        outP.append(q)
        if N:
            l=math.sqrt(sum(x*x for x in nn)) or 1; outN.append([x/l for x in nn])
        for d in range(3): allmin[d]=min(allmin[d],q[d]); allmax[d]=max(allmax[d],q[d])
    at['POSITION']=addAccessor(outP)
    if N: at['NORMAL']=addAccessor(outN)
    at.pop('JOINTS_0',None); at.pop('WEIGHTS_0',None)
# Knoten: nur noch der Mesh-Knoten ohne Transform
newNode={'name':nodes[meshNode].get('name','Figur'),'mesh':nodes[meshNode]['mesh']}
j['nodes']=[newNode]; j['scenes']=[{'nodes':[0]}]; j['scene']=0
j.pop('skins',None); j.pop('animations',None)
j['buffers']=[{'byteLength':len(newbin)}]
j['asset']['extras']={**j['asset'].get('extras',{}),'bearbeitung':f'fgsCheck 04.11.2026: Pose «{animName}» (erste Keyframes) statisch gebacken, Skin und Animationen entfernt'}
js=json.dumps(j,separators=(',',':')).encode(); js+=b' '*((4-len(js)%4)%4)
while len(newbin)%4: newbin+=b'\0'
out=b'glTF'+struct.pack('<II',2,12+8+len(js)+8+len(newbin))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(newbin),0x004E4942)+bytes(newbin)
open(dst,'wb').write(out)
print(dst,'bbox min',[round(v,3) for v in allmin],'max',[round(v,3) for v in allmax],'size',[round(allmax[d]-allmin[d],3) for d in range(3)],'bytes',len(out))
