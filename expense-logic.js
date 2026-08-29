(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.YeogiroExpense=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CURRENCIES={KRW:{symbol:'₩',digits:0,name:'원'},JPY:{symbol:'¥',digits:0,name:'엔'},USD:{symbol:'$',digits:2,name:'달러'},VND:{symbol:'₫',digits:0,name:'동'},EUR:{symbol:'€',digits:2,name:'유로'}};
  const CATEGORIES=['식비','카페','교통','숙소','항공','관광','쇼핑','기타'];
  const MICROS=1000000n,MAX_SAFE=BigInt(Number.MAX_SAFE_INTEGER);
  const currency=code=>CURRENCIES[code]||CURRENCIES.KRW;
  const knownCurrency=code=>Object.prototype.hasOwnProperty.call(CURRENCIES,code);
  function safeMinor(value){try{const number=Number(value);return Number.isSafeInteger(number)&&number>=0?number:null}catch{return null}}
  function safeNumber(value){return value<=MAX_SAFE?Number(value):null}
  function roundedDivide(numerator,denominator){return(numerator+denominator/2n)/denominator}
  function checkedAdd(left,right){const result=BigInt(left)+BigInt(right),number=safeNumber(result);if(number===null)throw new RangeError('금액이 안전한 정수 범위를 벗어났습니다.');return number}
  function amountToMinor(value,code='KRW'){
    const text=String(value??'').replace(/,/g,'').trim();if(!/^\d+(?:\.\d+)?$/.test(text))return null;
    const digits=currency(code).digits,[whole,decimal='']=text.split('.');if(decimal.length>digits)return null;
    const result=BigInt(whole)*10n**BigInt(digits)+BigInt((decimal+'0'.repeat(digits)).slice(0,digits)||'0');
    return safeNumber(result);
  }
  function minorToInput(value,code='KRW'){const digits=currency(code).digits,n=safeMinor(value);if(n===null)return null;if(!digits)return String(n);const scale=10**digits;return`${Math.floor(n/scale)}.${String(n%scale).padStart(digits,'0')}`}
  function convertMinor(amountMinor,from,to,rateMicros){
    const amount=safeMinor(amountMinor),rate=safeMinor(rateMicros);if(amount===null||rate===null)return null;
    if(from===to)return amount;if(!rate)return 0;
    const fromScale=10n**BigInt(currency(from).digits),toScale=10n**BigInt(currency(to).digits);
    return safeNumber(roundedDivide(BigInt(amount)*BigInt(rate)*toScale,MICROS*fromScale));
  }
  function rateMicrosFromQuote(foreignUnits,foreignCurrency,baseAmount,baseCurrency){
    if(!knownCurrency(foreignCurrency)||!knownCurrency(baseCurrency))return null;
    const foreignMinor=amountToMinor(foreignUnits,foreignCurrency),baseMinor=amountToMinor(baseAmount,baseCurrency);
    if(!foreignMinor||!baseMinor)return null;
    const foreignScale=10n**BigInt(currency(foreignCurrency).digits),baseScale=10n**BigInt(currency(baseCurrency).digits);
    const rate=safeNumber(roundedDivide(BigInt(baseMinor)*MICROS*foreignScale,BigInt(foreignMinor)*baseScale));
    return rate&&rate>0?rate:null;
  }
  function splitMinor(total,memberIds){
    const value=safeMinor(total);if(value===null)return[];
    const ids=[...new Set((memberIds||[]).filter(memberId=>typeof memberId==='string'&&memberId))].sort();
    if(!ids.length)return[];
    const each=Math.floor(value/ids.length),remainder=value-each*ids.length;
    return ids.map((memberId,index)=>({memberId,shareMinor:each+(index<remainder?1:0)}));
  }
  function expenseShares(expense){return splitMinor(expense.convertedMinor,expense.shareMemberIds)}
  function settlementFingerprint(expenses){return JSON.stringify((expenses||[]).map(x=>[x.id,x.convertedMinor,x.paidByMemberId,[...(x.shareMemberIds||[])].sort()]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))}
  function summarize(expenses,members=[]){
    const balances=new Map((members||[]).map(x=>[x.id,{memberId:x.id,name:x.name||x.display_name||'참여자',paidMinor:0,shareMinor:0,balanceMinor:0}])),categories=new Map();let totalMinor=0;
    for(const expense of expenses||[]){
      const amount=safeMinor(expense.convertedMinor);if(amount===null)continue;
      if(!balances.has(expense.paidByMemberId))balances.set(expense.paidByMemberId,{memberId:expense.paidByMemberId,name:'이전 참여자',paidMinor:0,shareMinor:0,balanceMinor:0});
      balances.get(expense.paidByMemberId).paidMinor=checkedAdd(balances.get(expense.paidByMemberId).paidMinor,amount);
      for(const share of expenseShares(expense)){if(!balances.has(share.memberId))balances.set(share.memberId,{memberId:share.memberId,name:'이전 참여자',paidMinor:0,shareMinor:0,balanceMinor:0});balances.get(share.memberId).shareMinor=checkedAdd(balances.get(share.memberId).shareMinor,share.shareMinor)}
      const category=expense.category||'기타';categories.set(category,checkedAdd(categories.get(category)||0,amount));totalMinor=checkedAdd(totalMinor,amount);
    }
    for(const value of balances.values())value.balanceMinor=value.paidMinor-value.shareMinor;
    return{totalMinor,categories:[...categories].map(([category,amountMinor])=>({category,amountMinor})).sort((a,b)=>b.amountMinor-a.amountMinor),members:[...balances.values()]};
  }
  function settle(expenses,members=[]){
    const summary=summarize(expenses,members),compare=(a,b)=>b.remaining-a.remaining||String(a.memberId).localeCompare(String(b.memberId));
    const creditors=summary.members.filter(x=>x.balanceMinor>0).map(x=>({...x,remaining:x.balanceMinor})).sort(compare),debtors=summary.members.filter(x=>x.balanceMinor<0).map(x=>({...x,remaining:-x.balanceMinor})).sort(compare),transfers=[];let ci=0,di=0;
    while(ci<creditors.length&&di<debtors.length){const amountMinor=Math.min(creditors[ci].remaining,debtors[di].remaining);transfers.push({fromMemberId:debtors[di].memberId,fromName:debtors[di].name,toMemberId:creditors[ci].memberId,toName:creditors[ci].name,amountMinor});creditors[ci].remaining-=amountMinor;debtors[di].remaining-=amountMinor;if(!creditors[ci].remaining)ci+=1;if(!debtors[di].remaining)di+=1}
    return{...summary,transfers};
  }
  function formatMinor(value,code='KRW',locale='ko-KR'){const amount=Number(value),safe=Number.isSafeInteger(amount)?amount:0;return new Intl.NumberFormat(locale,{style:'currency',currency:code,minimumFractionDigits:currency(code).digits,maximumFractionDigits:currency(code).digits}).format(safe/10**currency(code).digits)}
  return{CURRENCIES,CATEGORIES,currency,amountToMinor,minorToInput,convertMinor,rateMicrosFromQuote,splitMinor,expenseShares,settlementFingerprint,summarize,settle,formatMinor};
});
