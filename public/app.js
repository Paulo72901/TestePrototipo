const products={
 small:{name:"Caixa Misteriosa Pequena",price:59.90},
 medium:{name:"Caixa Misteriosa Média",price:89.90},
 large:{name:"Caixa Misteriosa Grande",price:129.90}
};
let quote=null;
const formMoney=n=>n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const selected=()=>document.querySelector('input[name="product"]:checked').value;
function update(){
 const id=selected(),p=products[id];
 document.querySelector("#summary-name").textContent=p.name;
 document.querySelector("#summary-price").textContent=formMoney(p.price);
 document.querySelector("#summary-freight").textContent=quote?formMoney(quote.amount):"—";
 document.querySelector("#summary-total").textContent=quote?formMoney(p.price+quote.amount):formMoney(p.price)+"*";
 document.querySelectorAll(".product").forEach(el=>el.classList.toggle("selected",el.querySelector("input").checked));
 document.querySelector("#pay").disabled=!quote;
}
document.querySelectorAll('input[name="product"]').forEach(el=>el.addEventListener("change",()=>{
 quote=null;document.querySelector("#error").textContent="";update();
}));
const cep=document.querySelector("#cep");
cep.addEventListener("input",()=>{
 const digits=cep.value.replace(/\D/g,"").slice(0,8);
 cep.value=digits.length>5?digits.slice(0,5)+"-"+digits.slice(5):digits;
 quote=null;update();
});
document.querySelector("#quote").addEventListener("click",async()=>{
 const error=document.querySelector("#error");error.textContent="";
 const clean=cep.value.replace(/\D/g,"");
 if(!/^\d{8}$/.test(clean)){error.textContent="Informe um CEP válido com 8 números.";return}
 const btn=document.querySelector("#quote");btn.disabled=true;btn.textContent="Consultando...";
 try{
  const response=await fetch("/api/shipping/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:selected(),destinationCep:clean})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível calcular o frete.");
  quote=data;update();
 }catch(e){error.textContent=e.message}
 finally{btn.disabled=false;btn.textContent="Calcular frete"}
});
document.querySelector("#pay").addEventListener("click",async()=>{
 const error=document.querySelector("#error");error.textContent="";
 if(!quote){error.textContent="Calcule o frete antes de continuar.";return}
 const btn=document.querySelector("#pay");btn.disabled=true;btn.textContent="Preparando pedido...";
 try{
  const response=await fetch("/api/orders/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:selected(),destinationCep:quote.destinationCep,freightAmount:quote.amount})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível registrar o pedido.");
  location.assign(data.nextUrl);
 }catch(e){error.textContent=e.message;btn.disabled=false;btn.innerHTML='Continuar para pagamento <span>↗</span>'}
});
update();
