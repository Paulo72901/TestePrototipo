import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

dotenv.config();
const app=express(),PORT=process.env.PORT||3000;
const BASE_URL=process.env.BASE_URL||`http://localhost:${PORT}`;
const ORIGIN_CEP=(process.env.ORIGIN_CEP||"03145010").replace(/\D/g,"");
const MP_PAYMENT_LINK=process.env.MP_PAYMENT_LINK||"";
const ADMIN_SECRET=process.env.ADMIN_SECRET||"";
const FREIGHT_MODE=process.env.FREIGHT_MODE||"demo";
const TALLY_FORM_URL=process.env.TALLY_FORM_URL||"";
const TALLY_FORM_ID=process.env.TALLY_FORM_ID||"";
const TALLY_SIGNING_SECRET=process.env.TALLY_SIGNING_SECRET||"";
const FORM_TOKEN_ENCRYPTION_KEY=process.env.FORM_TOKEN_ENCRYPTION_KEY||"";
const GOOGLE_SHEET_ID=process.env.GOOGLE_SHEET_ID||"";
const GOOGLE_SERVICE_ACCOUNT_JSON=process.env.GOOGLE_SERVICE_ACCOUNT_JSON||"";
const SUPABASE_URL=process.env.SUPABASE_URL||"";
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
const supabase=SUPABASE_URL&&SUPABASE_SERVICE_ROLE_KEY?createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}):null;

const PRODUCTS={
 small:{title:"Caixa Misteriosa Pequena",price:59.90,weightKg:.5,dimensions:{length:20,width:15,height:10}},
 medium:{title:"Caixa Misteriosa Média",price:89.90,weightKg:1,dimensions:{length:30,width:25,height:15}},
 large:{title:"Caixa Misteriosa Grande",price:129.90,weightKg:1.5,dimensions:{length:40,width:30,height:20}}
};
const digits=v=>String(v||"").replace(/\D/g,"");
const validCep=v=>/^\d{8}$/.test(digits(v));
const money=v=>Number(v).toFixed(2);
const sha256=v=>crypto.createHash("sha256").update(v).digest("hex");
function encryptionKey(){
 const key=Buffer.from(FORM_TOKEN_ENCRYPTION_KEY,"base64");
 if(key.length!==32)throw new Error("FORM_TOKEN_ENCRYPTION_KEY deve ser uma chave Base64 de 32 bytes.");
 return key;
}
function encryptToken(token){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",encryptionKey(),iv);
 const encrypted=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
 return [iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
function decryptToken(value){
 const [iv,tag,data]=String(value||"").split(".");
 if(!iv||!tag||!data)throw new Error("Token de formulário indisponível.");
 const decipher=crypto.createDecipheriv("aes-256-gcm",encryptionKey(),Buffer.from(iv,"base64url"));
 decipher.setAuthTag(Buffer.from(tag,"base64url"));
 return Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8");
}
const safeEqual=(a,b)=>{const aa=Buffer.from(String(a||""));const bb=Buffer.from(String(b||""));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)};
function requireDb(){if(!supabase)throw new Error("Banco de dados não configurado. Configure Supabase no servidor.");}
async function getOrderByRef(ref){requireDb();const {data,error}=await supabase.from("orders").select("*").eq("external_reference",ref).maybeSingle();if(error)throw error;return data}
async function updateOrder(ref,patch){requireDb();const {data,error}=await supabase.from("orders").update(patch).eq("external_reference",ref).select().single();if(error)throw error;return data}

app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["'self'","https://fonts.gstatic.com"],scriptSrc:["'self'"],imgSrc:["'self'","data:"],connectSrc:["'self'","https://viacep.com.br"]}}}));
app.use(express.json({limit:"40kb"}));
app.use(rateLimit({windowMs:15*60*1000,limit:100,standardHeaders:true,legacyHeaders:false}));
app.use(express.static("public"));

function demoFreight(cep,productId){
 const base={small:17.90,medium:22.90,large:29.90}[productId],p=Number(cep.slice(0,2));
 const factor=p<=19?1:p<=29?1.12:p<=39?1.18:p<=65?1.28:p<=69?1.35:p<=76?1.25:p<=79?1.30:p<=89?1.18:1.25;
 return Math.round(base*factor*100)/100;
}
async function quoteShipping(productId,destinationCep){
 if(!PRODUCTS[productId])throw new Error("Modelo inválido.");
 if(!validCep(destinationCep))throw new Error("CEP inválido.");
 if(FREIGHT_MODE==="loggi")throw new Error("Integração oficial Loggi ainda não configurada. Não é possível cotar este envio.");
 return {amount:demoFreight(digits(destinationCep),productId),service:"Frete demonstrativo",destinationCep:digits(destinationCep),productId,mode:"demo"};
}
app.post("/api/shipping/quote",async(req,res)=>{try{res.json(await quoteShipping(req.body.productId,req.body.destinationCep))}catch(e){res.status(400).json({error:e.message})}});

app.post("/api/orders/create",async(req,res)=>{
 try{
  requireDb();
  const {productId,destinationCep,freightAmount}=req.body||{},product=PRODUCTS[productId];
  if(!product)return res.status(400).json({error:"Escolha uma caixa válida."});
  if(!validCep(destinationCep))return res.status(400).json({error:"Informe um CEP válido."});
  const quote=await quoteShipping(productId,destinationCep);
  if(Number(freightAmount)!==Number(quote.amount))return res.status(409).json({error:"O frete mudou. Calcule novamente."});
  const externalReference=`CM-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const total=product.price+quote.amount;
  const {error}=await supabase.from("orders").insert({
   external_reference:externalReference,product_id:productId,product_name:product.title,
   product_amount:product.price,shipping_amount:quote.amount,total_amount:total,
   origin_cep:ORIGIN_CEP,destination_cep:digits(destinationCep),status:"awaiting_manual_payment",
   form_token_hash:sha256(crypto.randomBytes(32).toString("base64url"))
  });
  if(error)throw error;
  res.json({nextUrl:`/pedido.html?ref=${encodeURIComponent(externalReference)}`});
 }catch(e){console.error(e);res.status(500).json({error:"Não foi possível registrar o pedido."})}
});

app.get("/api/order-summary",async(req,res)=>{
 try{
  requireDb();const ref=String(req.query.ref||"");
  if(!/^CM-[A-Za-z0-9-]{8,60}$/.test(ref))return res.status(400).json({error:"Referência inválida"});
  const order=await getOrderByRef(ref);if(!order)return res.status(404).json({error:"Pedido não encontrado"});
  res.json({reference:order.external_reference,product:order.product_name,productAmount:order.product_amount,shippingAmount:order.shipping_amount,total:order.total_amount,status:order.status,paymentLinkConfigured:!!MP_PAYMENT_LINK});
 }catch(e){console.error(e);res.status(500).json({error:"Erro ao consultar pedido"})}
});

// Confirmação manual: endpoint administrativo protegido por segredo. Exigir acesso HTTPS e segredo forte.
app.post("/api/admin/orders/confirm-payment",async(req,res)=>{
 try{
  if(!ADMIN_SECRET||!safeEqual(req.get("x-admin-secret"),ADMIN_SECRET))return res.status(401).json({error:"Não autorizado"});
  const {reference}=req.body||{};const order=await getOrderByRef(String(reference||""));
  if(!order)return res.status(404).json({error:"Pedido não encontrado"});
  if(order.status==="ready_for_fulfillment"||order.status==="paid")return res.json({ok:true,status:order.status});
  await updateOrder(order.external_reference,{status:"paid",paid_at:new Date().toISOString(),payment_confirmation_method:"manual"});
  res.json({ok:true,status:"paid"});
 }catch(e){console.error(e);res.status(500).json({error:"Erro ao confirmar pagamento"})}
});

// Mercado Pago: validar assinatura, consultar a Order na API e só então marcar como paga.
function validateMpSignature(req){
 if(!MP_WEBHOOK_SECRET)return false;
 const signature=req.get("x-signature")||"",requestId=req.get("x-request-id")||"";
 const parts=Object.fromEntries(signature.split(",").map(p=>p.trim().split("=")));
 const ts=parts.ts,v1=parts.v1;
 const dataId=String(req.query["data.id"]||req.body?.data?.id||"").toLowerCase();
 if(!ts||!v1||!dataId)return false;
 const manifest=`id:${dataId};request-id:${requestId};ts:${ts};`;
 const expected=crypto.createHmac("sha256",MP_WEBHOOK_SECRET).update(manifest).digest("hex");
 return safeEqual(expected,v1);
}
app.get("/api/order-status",async(req,res)=>{
 try{
  requireDb();const ref=String(req.query.ref||"");
  if(!/^CM-[A-Za-z0-9-]{8,60}$/.test(ref))return res.status(400).json({error:"Referência inválida"});
  const order=await getOrderByRef(ref);if(!order)return res.status(404).json({error:"Pedido não encontrado"});
  if(order.status!=="paid")return res.json({status:order.status});
  if(!TALLY_FORM_URL||!TALLY_FORM_ID)return res.status(503).json({status:"paid",error:"Formulário Tally ainda não configurado"});
  res.json({status:"paid",formUrl:null,message:"A liberação do Tally será configurada após a conexão do formulário."});
 }catch(e){console.error(e);res.status(500).json({error:"Erro ao consultar pedido"})}
});

// Tally webhook: configure signing secret no painel do Tally. A validação usa o corpo JSON serializado.
function validateTallySignature(req){
 if(!TALLY_SIGNING_SECRET)return false;
 const received=req.get("tally-signature")||"";
 const calculated=crypto.createHmac("sha256",TALLY_SIGNING_SECRET).update(JSON.stringify(req.body)).digest("base64");
 return safeEqual(received,calculated);
}
function fieldMap(fields=[]){const out={};for(const f of fields){if(f?.label)out[String(f.label).trim().toLowerCase()]=f.value;}return out}
function findValue(map,labels){for(const l of labels){if(map[l]!==undefined&&map[l]!==null)return Array.isArray(map[l])?map[l].join(", "):String(map[l]);}return ""}
app.post("/api/webhooks/tally",async(req,res)=>{
 try{
  if(!validateTallySignature(req))return res.status(401).send("Assinatura Tally inválida");
  const payload=req.body||{},data=payload.data||{};
  if(payload.eventType!=="FORM_RESPONSE"||data.formId!==TALLY_FORM_ID)return res.status(200).send("Evento/formulário ignorado");
  const fields=fieldMap(data.fields||[]);
  const ref=findValue(fields,["order_id"]);
  const token=findValue(fields,["access_token"]);
  if(!ref||!token)return res.status(400).send("Campos ocultos ausentes");
  const order=await getOrderByRef(ref);
  if(!order||order.status!=="paid"||order.fulfillment_submitted_at)return res.status(409).send("Pedido não elegível");
  if(!safeEqual(sha256(token),order.form_token_hash))return res.status(401).send("Token inválido");
  const address={
   full_name:findValue(fields,["nome completo","name"]),
   email:findValue(fields,["e-mail","email"]),
   phone:findValue(fields,["whatsapp","telefone"]),
   cpf:findValue(fields,["cpf"]),
   cep:findValue(fields,["cep"]),
   street:findValue(fields,["rua / avenida","endereço","endereco"]),
   number:findValue(fields,["número","numero"]),
   complement:findValue(fields,["complemento"]),
   district:findValue(fields,["bairro"]),
   city:findValue(fields,["cidade"]),
   state:findValue(fields,["estado","uf"])
  };
  if(!address.full_name||!address.cep||!address.street||!address.number||!address.city||!address.state)return res.status(400).send("Dados de entrega incompletos");
  // Primeiro sincroniza a planilha. A função verifica a referência para evitar duplicatas
  // caso o Tally reenvie o webhook após uma falha temporária.
  await appendToGoogleSheet(order,address);
  await updateOrder(ref,{fulfillment_submitted_at:new Date().toISOString(),tally_submission_id:data.submissionId||data.responseId||null,shipping_details:address,status:"ready_for_fulfillment",form_token_ciphertext:null});
  res.status(200).send("Dados de entrega recebidos");
 }catch(e){console.error("Tally webhook",e);res.status(500).send("Erro interno")}
});

async function appendToGoogleSheet(order,address){
 if(!GOOGLE_SHEET_ID||!GOOGLE_SERVICE_ACCOUNT_JSON)return;
 const credentials=JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
 const auth=new google.auth.GoogleAuth({credentials,scopes:["https://www.googleapis.com/auth/spreadsheets"]});
 const sheets=google.sheets({version:"v4",auth});
 const existing=await sheets.spreadsheets.values.get({spreadsheetId:GOOGLE_SHEET_ID,range:"Pedidos!A2:A"});
 const alreadyAdded=(existing.data.values||[]).some(row=>String(row[0]||"")===order.external_reference);
 if(alreadyAdded)return;
 await sheets.spreadsheets.values.append({
  spreadsheetId:GOOGLE_SHEET_ID,range:"Pedidos!A:Q",valueInputOption:"USER_ENTERED",insertDataOption:"INSERT_ROWS",
  requestBody:{values:[[
   order.external_reference,order.product_name,order.product_amount,order.shipping_amount,order.total_amount,
   order.status,address.full_name,address.email,address.phone,address.cpf,address.cep,address.street,
   address.number,address.complement,address.district,address.city,address.state
  ]]}
 });
}
app.get("/health",(_req,res)=>res.json({ok:true,db:!!supabase,paymentLink:!!MP_PAYMENT_LINK,tally:!!TALLY_FORM_URL}));
app.listen(PORT,()=>console.log(`Checkout iniciado na porta ${PORT}`));
