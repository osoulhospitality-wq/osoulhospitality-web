import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'scripts/pilot-partner');
const output=path.join(root,'pilot');
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,12);
const [template,skin,appCss,mark]=await Promise.all([
  readFile(path.join(dir,'shell.html'),'utf8'),readFile(path.join(dir,'shell.css'),'utf8'),
  readFile(path.join(root,'command-center/enterprise/app.css'),'utf8'),
  readFile(path.join(root,'brand/osool-mark-v8.svg'),'utf8')
]);
const marker='/* Pilot workspace */';
if(!appCss.includes(marker))throw new Error('Pilot styles missing');
const css=skin+'\n.client-table{overflow:auto;max-height:27rem}\n'+appCss.slice(appCss.indexOf(marker));
const banner="document.documentElement.lang=location.hash==='#en'?'en':'ar';document.documentElement.dir=document.documentElement.lang==='en'?'ltr':'rtl';";
const result=await build({
  entryPoints:[path.join(dir,'view.mjs')],bundle:true,minify:true,platform:'browser',
  format:'iife',target:'es2020',write:false,banner:{js:banner},legalComments:'none'
});
const js=result.outputFiles[0].text;
const base=template.replace('<!-- MARK -->',mark.replace('<svg ','<svg aria-hidden="true" focusable="false" '));
function html(offline){
  const scripts=offline?"'unsafe-inline'":"'self'";
  const policy=`default-src 'none'; script-src ${scripts}; style-src ${offline?"'unsafe-inline'":"'self' 'unsafe-inline'"}; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'`;
  return base.replace('<!-- ALLOW_RESOURCES -->','<meta http-equiv="Content-Security-Policy" content="'+policy+'">')
    .replace('<!-- STYLE -->',()=>offline?'<style>'+css+'</style>':'<link rel="stylesheet" href="./pilot.css?v='+hash(css)+'">')
    .replace('<!-- SCRIPT -->',()=>offline?'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>':'<script defer src="./app.js?v='+hash(js)+'"></script>');
}
await mkdir(output,{recursive:true});
await Promise.all([writeFile(path.join(output,'index.html'),html(false)),writeFile(path.join(output,'pilot.css'),css),writeFile(path.join(output,'app.js'),js)]);
if(process.argv[2])await writeFile(process.argv[2],html(true));
