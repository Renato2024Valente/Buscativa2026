(function(){
  const modal = document.getElementById("modalCalc");
  if(!modal) return;

  const display = document.getElementById("calcDisplay");

  function setValue(v){
    display.value = v;
  }
  function getValue(){
    return display.value || "";
  }

  function sanitize(expr){
    // permite apenas números, operadores básicos, parênteses, ponto e espaços
    const ok = /^[0-9+\-*/().\s]*$/.test(expr);
    return ok ? expr : "";
  }

  function safeEval(expr){
    const clean = sanitize(expr);
    if(!clean) return null;
    try{
      // evita eval direto; ainda assim, limitado por sanitize
      const result = Function(`"use strict"; return (${clean});`)();
      if(typeof result !== "number" || !isFinite(result)) return null;
      // reduz ruído de ponto flutuante
      const rounded = Math.round((result + Number.EPSILON) * 1e10) / 1e10;
      return rounded;
    }catch(e){
      return null;
    }
  }

  function append(ch){
    const cur = getValue();
    // evita zero inicial esquisito
    if(cur === "0" && /[0-9]/.test(ch)) setValue(ch);
    else setValue(cur + ch);
  }

  function backspace(){
    const cur = getValue();
    setValue(cur.length ? cur.slice(0, -1) : "");
  }

  function clearAll(){ setValue(""); }

  function equals(){
    const cur = getValue();
    const res = safeEval(cur);
    if(res === null){
      setValue("Erro");
      return;
    }
    setValue(String(res));
  }

  modal.addEventListener("click", (e)=>{
    const btn = e.target.closest("button");
    if(!btn) return;

    const val = btn.getAttribute("data-val");
    const act = btn.getAttribute("data-act");

    if(val){
      if(getValue() === "Erro") clearAll();
      append(val);
      return;
    }
    if(act === "clear") return clearAll();
    if(act === "back") return backspace();
    if(act === "eq") return equals();
  });

  // quando abrir, deixa prontinha
  modal.addEventListener("shown.bs.modal", ()=>{
    if(!display.value || display.value === "Erro") display.value = "";
  });
})();
