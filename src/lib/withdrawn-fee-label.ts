type Charge={category:'main'|'extra';chargedCents:number;cancelledCents:number}
export function withdrawnFeeLabel(feeCents:number,charges?:Charge[]){
 const money=(cents:number)=>(cents/100).toLocaleString('en-US',{style:'currency',currency:'USD'})
 if(!charges)return `${money(feeCents)} · checking withdrawal`
 const main=charges.filter(charge=>charge.category==='main')
 if(main.length&&main.every(charge=>charge.chargedCents===0)&&main.some(charge=>charge.cancelledCents>0))return `${money(feeCents)} · canceled`
 const retained=main.reduce((sum,charge)=>sum+charge.chargedCents,0)
 return retained>0?`${money(feeCents)} · ${money(retained)} retained after withdrawal`:`${money(feeCents)} · no event fee owed`
}
