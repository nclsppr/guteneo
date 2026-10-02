import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { invoiceTemplate, letterTemplate } from "../packages/templates/gallery";
const directory=new URL("../examples/template-workflow/",import.meta.url);
await mkdir(directory,{recursive:true});
const invoice=invoiceTemplate();
for(const [name,value] of Object.entries({
  "create-template.json":{envelope:invoice},
  "create-letter.json":{envelope:letterTemplate()},
  "generate-records.json":{templateId:"REPLACE_TEMPLATE_ID",templateVersion:1,mode:"generate_only",records:[{recordId:"customer-001",data:{...invoice.sampleData,customer:{name:"Entreprise Exemple A"},reference:"EX-001",fax:"+33123456789"}},{recordId:"customer-002",data:{...invoice.sampleData,customer:{name:"Entreprise Exemple B"},reference:"EX-002",fax:"+33123456788"}}]},
  "distribution-common.json":{jobId:"REPLACE_JOB_ID",explicitMultichannel:false,entries:["customer-001","customer-002"].map((recordId,i)=>({entryId:"common-"+i,recordId,channel:"fax",recipient:{phone:"+33123456789"},ceilingMinor:200}))},
  "distribution-from-data.json":{jobId:"REPLACE_JOB_ID",explicitMultichannel:false,entries:["customer-001","customer-002"].map((recordId,i)=>({entryId:"personal-"+i,recordId,channel:"fax",recipientFields:{phone:"fax"},ceilingMinor:200}))},
})) await writeFile(new URL(name,directory),JSON.stringify(value,null,2)+"\n");
await copyFile(new URL("../tests/fixtures/datasets/clients-articles.xlsx",import.meta.url),new URL("clients-articles.xlsx",directory));
await copyFile(new URL("../tests/fixtures/datasets/clients-articles.mapping.json",import.meta.url),new URL("clients-articles.mapping.json",directory));
console.log("Exemples synthétiques API/MCP générés.");
