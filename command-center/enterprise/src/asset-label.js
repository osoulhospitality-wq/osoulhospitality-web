import qrcode from "qrcode-generator";

// Only the opaque server-issued lookup key is encoded. The label never carries a URL or an access credential.
export function assetLabelMatrix(token) {
  if (typeof token !== "string" || !/^[a-zA-Z0-9:_-]{8,120}$/.test(token)) {
    throw new TypeError("Invalid asset tag");
  }
  const symbol = qrcode(0, "M");
  symbol.addData(token, "Byte");
  symbol.make();
  const size = symbol.getModuleCount();
  const quiet = 4;
  return Array.from({length:size+2*quiet}, (_,y) => Array.from({length:size+2*quiet}, (_,x) =>
    x >= quiet && y >= quiet && x < size+quiet && y < size+quiet && symbol.isDark(y-quiet,x-quiet)));
}

export function assetLabelGraphic(token, title) {
  const modules = assetLabelMatrix(token);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label",title);
  svg.setAttribute("viewBox","0 0 "+modules.length+" "+modules.length);
  svg.setAttribute("shape-rendering","crispEdges");
  const background = document.createElementNS(svg.namespaceURI,"rect");
  background.setAttribute("width","100%");background.setAttribute("height","100%");background.setAttribute("fill","#fff");
  const ink = document.createElementNS(svg.namespaceURI,"path");
  const path=[];
  for(const [y,row] of modules.entries()){
    for(const [x,dark] of row.entries()) if(dark) path.push("M"+x+" "+y+"h1v1h-1z");
  }
  ink.setAttribute("fill","#000");
  ink.setAttribute("d",path.join(""));
  svg.append(background,ink);
  return svg;
}

export function printAssetLabel(label) {
  const sheet = document.createElement("div");
  sheet.className = "asset-print-sheet";
  sheet.append(label.cloneNode(true));
  document.querySelector(".asset-print-sheet")?.remove();
  document.body.append(sheet);
  document.body.classList.add("printing-asset-label");
  const clean = () => {
    sheet.remove();
    document.body.classList.remove("printing-asset-label");
  };
  window.addEventListener("afterprint",clean,{once:true});
  try {window.print();} catch (e) {clean();throw e;}
}
