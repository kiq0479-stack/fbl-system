import { createClient } from '@supabase/supabase-js';

const sb = createClient('https://curqrfxjsslsqimzoios.supabase.co', 'sb_secret_feF3UVXZxu9Ow98nKf9M2Q_RkAfLMjU');

// Load tokens from EC2
async function getTokenFromEC2(envVar) {
  // We'll pass tokens as args
}

async function getDayOrders(token, date, retries=3) {
  const from = date + 'T00:00:00.000+09:00';
  const to = date + 'T23:59:59.999+09:00';
  const url = `https://api.commerce.naver.com/external/v1/pay-order/seller/product-orders?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&rangeType=PAYED_DATETIME&pageSize=300&page=1`;
  const r = await fetch(url, {headers:{Authorization:'Bearer '+token}});
  if (r.status === 429 && retries > 0) {
    console.log('  429 retry in 5s...');
    await new Promise(r=>setTimeout(r,5000));
    return getDayOrders(token, date, retries-1);
  }
  const json = await r.json();
  return json?.data?.contents || [];
}

async function loadMappings() {
  const {data} = await sb.from('product_mappings').select('product_id, external_product_name, external_option_name').eq('marketplace','naver').eq('is_active',true);
  const map = new Map();
  data?.forEach(m => {
    if (m.external_product_name) {
      if (m.external_option_name) map.set(m.external_product_name+'|||'+m.external_option_name, m.product_id);
      map.set(m.external_product_name, m.product_id);
    }
  });
  return map;
}

function matchProduct(mappings, name, option) {
  if (option) { const k = name+'|||'+option; if (mappings.has(k)) return mappings.get(k); }
  return mappings.get(name) || null;
}

async function syncAccount(name, token, mappings) {
  console.log(`\n=== ${name} 120일 백필 ===`);
  
  let total=0, inserted=0, skipped=0, errors=0, cozy=0;
  for (let i=0; i<120; i++) {
    const d = new Date(Date.now()-i*86400000);
    const ds = d.toISOString().split('T')[0];
    const items = await getDayOrders(token, ds);
    
    for (const item of items) {
      const po = item?.content?.productOrder || {};
      const ord = item?.content?.order || {};
      if (po.productName?.includes('코지앤칠')) { cozy++; continue; }
      total++;
      
      // Check existing by product_order_id
      const {data:existing} = await sb.from('naver_orders').select('id').eq('product_order_id', item.productOrderId).single();
      if (existing) { skipped++; continue; }
      
      const productId = matchProduct(mappings, po.productName, po.productOption);
      const {error} = await sb.from('naver_orders').insert({
        product_order_id: item.productOrderId,
        order_id: ord.orderId,
        payment_date: ord.paymentDate,
        product_name: po.productName,
        product_option: po.productOption || null,
        quantity: po.quantity || 1,
        total_payment_amount: po.totalPaymentAmount || 0,
        status: po.productOrderStatus,
        account_name: name,
        product_id: productId,
        channel_product_id: po.productId || null,
      });
      
      if (error) {
        if (errors < 3) console.log('  ❌', error.message);
        errors++;
      } else {
        inserted++;
      }
    }
    if (items.length > 0) console.log(`${ds}: ${items.length}건 (new:${inserted} err:${errors})`);
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log(`\n${name} 완료: total=${total} new=${inserted} dup=${skipped} err=${errors} cozy=${cozy}`);
  return inserted;
}

// Get tokens from command line args
const [,, shiltToken, meoToken] = process.argv;

(async () => {
  const mappings = await loadMappings();
  console.log('매핑:', mappings.size, '개');
  
  let totalNew = 0;
  totalNew += await syncAccount('쉴트코리아', shiltToken, mappings);
  totalNew += await syncAccount('메오메오.', meoToken, mappings);
  
  const {count:total} = await sb.from('naver_orders').select('*',{count:'exact',head:true});
  const {count:mapped} = await sb.from('naver_orders').select('*',{count:'exact',head:true}).not('product_id','is',null);
  const {count:hosin} = await sb.from('naver_orders').select('*',{count:'exact',head:true}).ilike('product_name','%호신%');
  const {count:cat} = await sb.from('naver_orders').select('*',{count:'exact',head:true}).ilike('product_name','%캣휠%');
  console.log(`\n=== 최종 ===`);
  console.log(`전체: ${total} 매핑: ${mapped} (${Math.round(mapped/total*100)}%)`);
  console.log(`호신용품: ${hosin} 캣휠: ${cat}`);
  console.log(`신규 추가: ${totalNew}`);
})();
