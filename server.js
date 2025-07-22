require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const crypto  = require('crypto');

const ID   = process.env.PAYNOW_INTEGRATION_ID  || '21458';
const KEY  = process.env.PAYNOW_INTEGRATION_KEY || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MAIL = process.env.MERCHANT_EMAIL         || 'sukaravtech@gmail.com';
const DEF_RETURN = process.env.PAYNOW_RETURN_URL || 'https://sukaravtech.art/success';
const DEF_RESULT = process.env.PAYNOW_RESULT_URL || 'https://sukaravtech.art/paynow-status';

const app = express();
app.use(cors({origin:'*'}));
app.options('*', (_,r)=>r.sendStatus(204));
app.use(express.json());
app.use(express.urlencoded({extended:true}));

app.use((req,_,n)=>{
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`,
              'body→', JSON.stringify(req.body||{}));
  n();
});

function buildHash(o){
  const s =
    o.id+o.reference+o.amount+o.additionalinfo+o.returnurl+o.resulturl+KEY;
  return crypto.createHash('sha512').update(s,'utf8').digest('hex').toUpperCase();
}

app.post('/create-paynow-order', async (req,res)=>{
  const {amount,reference,additionalinfo,returnurl,resulturl,email}=req.body||{};
  if(!amount)return res.status(400).json({success:false,error:'Amount required'});

  const raw={
    id:ID,
    reference:reference||`INV-${Date.now()}`,
    amount:Number(amount).toFixed(2),
    additionalinfo:additionalinfo||'AI Glow Preview',
    returnurl:returnurl||DEF_RETURN,
    resulturl:resulturl||DEF_RESULT
  };

  const payload={
    ...raw,
    status:'Message',
    authemail:email||MAIL,
    hash:buildHash(raw)
  };

  console.log('[Paynow] Outgoing payload:',payload);

  const form=new URLSearchParams();
  for(const [k,v] of Object.entries(payload)){
    form.append(k, (k==='returnurl'||k==='resulturl') ? encodeURIComponent(v):v);
  }

  try{
    const r=await axios.post(
      'https://www.paynow.co.zw/interface/initiatetransaction',
      form,
      {headers:{'Content-Type':'application/x-www-form-urlencoded'}}
    );
    console.log('[Paynow] Raw response:',r.data);
    const p=new URLSearchParams(r.data);
    if(p.get('status')?.toUpperCase()==='OK' && p.get('browserurl')){
      return res.json({success:true,url:p.get('browserurl')});
    }
    return res.status(400).json({success:false,error:p.get('error')||'Paynow error'});
  }catch(e){
    console.error('[Paynow] HTTP error',e?.response?.data||e.message);
    res.status(500).json({success:false,error:'Server error'});
  }
});

const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`Paynow server listening on ${PORT}`));
