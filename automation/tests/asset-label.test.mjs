import {test} from "node:test";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import {assetLabelMatrix} from "../../command-center/enterprise/src/asset-label.js";

for (const token of ["1f1b75c2-02d0-4dd1-988c-0d2128bed25d","DRAQON-aabcde987654", "a".repeat(96)]) {
  test("independent QR decoder recovers the opaque label of length "+token.length,()=>{
    const matrix=assetLabelMatrix(token);
    const scale=5;const width=matrix.length*scale;
    const rgba=new Uint8ClampedArray(width*width*4);
    for(let y=0;y<width;y++) for(let x=0;x<width;x++){
      const start=(y*width+x)*4;const color=matrix[Math.floor(y/scale)][Math.floor(x/scale)]?0:255;
      rgba.set([color,color,color,255],start);
    }
    assert.ok(matrix.slice(0,4).every(row=>row.every(value=>!value)));
    assert.equal(jsQR(rgba,width,width)?.data,token);
  });
}
test("URLs and free text are never encoded on an asset label",()=>{
  for(const input of ["https://example.invalid/asset?id=secret","asset in room 204","",null]) assert.throws(()=>assetLabelMatrix(input));
});
