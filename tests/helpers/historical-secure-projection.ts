/** Test-only compatibility for populated upgrade proofs before migration 0056.
 * These fixtures cannot contain secure distributions. Current-schema security
 * tests never use this adapter; all historical financial SQL stays real. */
function project(sql:string) {
  if(sql==="SELECT 1 FROM secure_distributions WHERE organization_id=? AND source_id=?")
    return "SELECT 1 WHERE 0=1 AND ? IS NULL AND ? IS NULL";
  for(const marker of ["(NOT EXISTS(SELECT 1 FROM secure_distributions secure_source", "(json_type("]) {
    let offset=0;
    for(;;){
      const start=sql.indexOf(marker,offset);if(start<0)break;
      let depth=0,quoted=false,end=start;
      for(;end<sql.length;end++){
        const char=sql[end];if(char==="'"){if(quoted&&sql[end+1]==="'"){end++;continue;}quoted=!quoted;}
        if(quoted)continue;
        if(char==="(")depth++;
        if(char===")"&&--depth===0){end++;break;}
      }
      const expression=sql.slice(start,end);
      if(!expression.includes("secure_distributions")){offset=end;continue;}
      const count=(expression.match(/\?/g)??[]).length,replacement=`(1=1${" OR ? IS NULL".repeat(count)})`;
      sql=sql.slice(0,start)+replacement+sql.slice(end);offset=start+replacement.length;
    }
  }
  return sql;
}
export function historicalSecureProjection(db:D1Database):D1Database {
  return new Proxy(db,{
    get(target,property){
      if(property==="prepare")return (source:string)=>{
        let sql=project(source),dropAt:number|null=null;
        if(sql.startsWith("INSERT INTO approvals(")&&sql.includes(",secure_approval_evidence_id)")){
          const match=/INSERT INTO approvals\(([^)]+)\) SELECT ([?,]+) WHERE/.exec(sql);
          if(!match)throw new Error("Unexpected historical approval shape");
          const columns=match[1].split(","),values=match[2].split(",");dropAt=columns.indexOf("secure_approval_evidence_id");
          columns.splice(dropAt,1);values.splice(dropAt,1);
          sql=sql.replace(match[0],`INSERT INTO approvals(${columns.join(",")}) SELECT ${values.join(",")} WHERE`).replace(",secure_approval_evidence_id=excluded.secure_approval_evidence_id","");
        }
        const statement=target.prepare(sql);
        return dropAt===null?statement:new Proxy(statement,{get(original,field){if(field==="bind")return(...values:unknown[])=>{if(values[dropAt!]!==null)throw new Error("Secure evidence cannot exist in a historical fixture");return original.bind(...values.filter((_,index)=>index!==dropAt));};const value=Reflect.get(original,field);return typeof value==="function"?value.bind(original):value;}});
      };
      const value=Reflect.get(target,property);return typeof value==="function"?value.bind(target):value;
    },
  });
}
