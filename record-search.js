(()=>{"use strict";
const norm=value=>String(value??"").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g,"");
const values=value=>Array.isArray(value)?value:[value];
function filter(records,query,referenceOf,fieldsOf=()=>[]){
 const term=String(query??"").trim().toLowerCase();
 if(!term)return records;
 const refTerm=norm(term);
 const refs=row=>values(referenceOf(row)).filter(v=>v!=null&&v!=="");
 const exact=refTerm?records.filter(row=>refs(row).some(v=>norm(v)===refTerm)):[];
 if(exact.length)return exact;
 const looksLikeReference=refTerm.startsWith("blc");
 return records.filter(row=>{
  const numbers=refs(row);
  if(looksLikeReference)return numbers.some(v=>norm(v).includes(refTerm));
  return [...numbers,...values(fieldsOf(row))].some(v=>String(v??"").toLowerCase().includes(term))
   ||(refTerm&&numbers.some(v=>norm(v).includes(refTerm)));
 });
}
window.BLCRecordSearch=Object.freeze({filter});
})();