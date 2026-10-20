import jwt from 'jsonwebtoken';
const B='http://localhost:3000';
const staff='token='+jwt.sign({userId:'u1',username:'kasir1',role:'kasir'},'testsecret');
const owner='token='+jwt.sign({userId:'u2',username:'own',role:'owner'},'testsecret');
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:fail++; if(!c) console.log('FAIL',m);};
async function call(method,path,body,cookie){
  const r=await fetch(B+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  let j=null; try{j=await r.json()}catch{} return {status:r.status,json:j};
}
const items=[{menuId:'menu-4',quantity:2}]; // 2 x 20.000 = 40.000
let r=await call('POST','/api/orders',{customerName:'Budi',tableNumber:'1',items,paymentMethod:'cash'});
ok(r.status===400,'tanpa HP ditolak');
r=await call('POST','/api/orders',{customerName:'Budi',customerPhone:'123',tableNumber:'1',items,paymentMethod:'cash'});
ok(r.status===400,'HP invalid ditolak');
const variants=['081234567890','0812-3456-7890','+6281234567890','6281234567890','081234567890'];
for(let i=0;i<5;i++){
  r=await call('POST','/api/orders',{customerName:'Budi',customerPhone:variants[i],tableNumber:'1',items,paymentMethod:'cash'});
  ok(r.status===201&&r.json.order.totalPrice===40000&&!r.json.order.discountAmount,'order penuh #'+(i+1));
  for(const s of ['diproses','siap_diambil','selesai']){const u=await call('PUT',`/api/orders/${r.json.order.id}/status`,{status:s},staff); ok(u.status===200,'status '+s);}
}
let st=await call('GET','/api/loyalty/0812-3456-7890');
ok(st.json.voucher?.percent===10&&st.json.completedOrders===5,'voucher terbit setelah ke-5');
ok((await call('GET','/api/loyalty/081300000000')).json.voucher===null,'nomor lain tanpa voucher');
r=await call('POST','/api/orders',{customerName:'Budi',customerPhone:'081234567890',tableNumber:'2',items,paymentMethod:'qris'});
ok(r.json.order.discountAmount===4000&&r.json.order.totalPrice===36000,'diskon 4.000 total 36.000');
const v=r.json.order.id;
ok((await call('GET','/api/loyalty/081234567890')).json.voucher===null,'voucher habis');
r=await call('POST','/api/orders',{customerName:'Budi',customerPhone:'081234567890',tableNumber:'2',items,paymentMethod:'cash'});
ok(r.json.order.totalPrice===40000,'berikutnya harga penuh');
let a=await call('POST',`/api/orders/${v}/items`,{items:[{menuId:'menu-3',quantity:1}],customerName:'Budi',tableNumber:'2'});
ok(a.json.order.discountAmount===6500&&a.json.order.totalPrice===58500,'tambah item sebelum bayar: base 65.000 -> diskon 6.500');
await call('PUT',`/api/orders/${v}/status`,{status:'diproses'},staff);
a=await call('POST',`/api/orders/${v}/items`,{items:[{menuId:'menu-4',quantity:1}],customerName:'Budi',tableNumber:'2'});
ok(a.json.order.discountAmount===6500&&a.json.order.additionalAmount===20000&&a.json.order.totalPrice===78500,'item tambahan setelah bayar harga penuh');
const c=await call('PUT',`/api/orders/${v}/items/menu-3/cancel`,undefined,staff);
ok(c.json.order.discountAmount===4000&&c.json.order.totalPrice===56000,'batal item hitung ulang diskon');
await call('PUT',`/api/orders/${v}/cancel`,undefined,staff);
ok((await call('GET','/api/loyalty/081234567890')).json.voucher?.percent===10,'voucher pulih setelah batal');
r=await call('POST','/api/orders',{customerName:'Budi',customerPhone:'081234567890',tableNumber:'3',items,paymentMethod:'cash'});
ok(r.json.order.discountAmount===4000,'voucher pulih terpasang lagi');
await call('DELETE',`/api/orders/${r.json.order.id}`,undefined,staff);
ok((await call('GET','/api/loyalty/081234567890')).json.voucher?.percent===10,'voucher pulih setelah hapus');
r=await call('POST','/api/orders',{customerName:'Budi',customerPhone:'081234567890',tableNumber:'3',items:[{menuId:'menu-4',quantity:30}],paymentMethod:'cash'});
ok(r.json.order.discountAmount===25000&&r.json.order.totalPrice===575000,'cap 25.000');
const pub=await call('GET',`/api/orders/${r.json.order.id}`);
ok(pub.json.customerPhone==='0812****7890','publik dimasking');
ok((await call('GET','/api/orders',undefined,staff)).json.some(o=>o.customerPhone==='081234567890'),'staf lihat penuh');
ok((await call('GET','/api/loyalty/abc')).status===400,'loyalty invalid 400');
ok((await call('GET','/api/vouchers')).status===401,'vouchers butuh login');
const sv=await call('POST','/api/settings',{name:'C',address:'A',phone:'1',loyaltyEvery:3,loyaltyPercent:20,loyaltyMaxDiscount:0},owner);
const gs=await call('GET','/api/settings');
ok(sv.status===200&&gs.json.loyaltyEvery===3&&gs.json.loyaltyPercent===20&&gs.json.loyaltyMaxDiscount===0,'pengaturan tersimpan');
console.log(`Express: ${pass} lulus, ${fail} gagal`);
