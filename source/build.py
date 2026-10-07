import json
sh=open('src/shell.html').read()
x=open('src/xlsx.mini.min.js').read().replace('</script','<\\/script')
a=open('src/app.js').read()
assert '</script' not in a
out=sh.replace('/*XLSX*/',x,1).replace('/*APPJS*/',a,1)
open('TreeViz.html','w').write(out)
print(len(out))
