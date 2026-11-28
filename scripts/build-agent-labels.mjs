import {writeFileSync} from "node:fs";
import {facilityCouncil} from "../automation/corporation/facility-council.mjs";
import {getAgent} from "../automation/corporation/registry.mjs";

// Only public-facing role names belong in the browser bundle.
const names = {};
for (const role of facilityCouncil) {
  for (const id of [role.lead,role.reviewer]) {
    const {name,nameAr} = getAgent(id);
    names[id] = {name,nameAr};
  }
}
writeFileSync(new URL("../command-center/enterprise/src/council-names.json",import.meta.url),JSON.stringify(names,null,2)+"\n");
