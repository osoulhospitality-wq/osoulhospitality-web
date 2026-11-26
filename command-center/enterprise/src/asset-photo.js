import jsQR from "jsqr";

// The photograph stays in the browser. Only the decoded lookup token reaches the scoped lookup RPC.
export async function readAssetPhoto(file) {
  if(!file || file.size>24*1024*1024 || !file.type.startsWith("image/")) throw new TypeError("Unsupported image");
  const image=new Image();
  const url=URL.createObjectURL(file);
  try{
    image.src=url;await image.decode();
    const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));
    const width=Math.max(1,Math.round(image.naturalWidth*scale));
    const height=Math.max(1,Math.round(image.naturalHeight*scale));
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d",{willReadFrequently:true});
    context.drawImage(image,0,0,width,height);
    const pixels=context.getImageData(0,0,width,height);
    return jsQR(pixels.data,width,height,{inversionAttempts:"attemptBoth"})?.data || "";
  }finally{URL.revokeObjectURL(url);}
}
