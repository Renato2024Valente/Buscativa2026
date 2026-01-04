(function(){
  const form = document.getElementById("formFrequencia");
  const msgBox = document.getElementById("msgBox");
  const tbody = document.getElementById("tbodyFrequencias");
  const filtroTurma = document.getElementById("filtroTurma");
  const filtroSemana = document.getElementById("filtroSemana");
  const btnAtualizar = document.getElementById("btnAtualizar");
  const btnDeletar = document.getElementById("btnDeletar");
  const chkAll = document.getElementById("chkAll");

  function showMsg(kind, text){
    msgBox.classList.remove("d-none","alert-success","alert-danger","alert-warning","alert-info");
    msgBox.classList.add("alert", `alert-${kind}`);
    msgBox.textContent = text;
  }
  function hideMsg(){ msgBox.classList.add("d-none"); }

  function badge(status){
    if(!status) return "";
    if(status === "pendente") return `<span class="badge bg-warning text-dark">Buscativa pendente</span>`;
    if(status === "feita") return `<span class="badge bg-success">Buscativa feita</span>`;
    if(status === "cancelada") return `<span class="badge bg-secondary">Buscativa cancelada</span>`;
    return "";
  }

  function row(f){
    const below = f.abaixo_80;
    const b = f.buscativa;
    const status = b ? b.status : "";
    const cls = below ? "row-low" : "";
    const statusTxt = below
      ? `<span class="badge bg-danger">Abaixo 80%</span> ${badge(status)}`
      : `<span class="badge bg-success">OK</span> ${badge(status)}`;

    return `
      <tr class="${cls}">
        <td><input class="form-check-input row-check" type="checkbox" data-id="${f.id}"></td>
        <td class="fw-semibold">${f.aluno.turma}</td>
        <td>${f.aluno.nome}${f.aluno.ra ? ` <span class="text-secondary small">(RA ${f.aluno.ra})</span>` : ""}</td>
        <td>${f.semana_inicio}</td>
        <td class="text-end">${f.total_aulas}</td>
        <td class="text-end">${f.faltas}</td>
        <td class="text-end"><span class="fw-bold">${Number(f.frequencia_percent).toFixed(2)}%</span></td>
        <td>${statusTxt}</td>
      </tr>
    `;
  }

  async function load(){
    const turma = (filtroTurma.value || "").trim();
    const semana_inicio = (filtroSemana.value || "").trim();

    const params = new URLSearchParams();
    if(turma) params.set("turma", turma);
    if(semana_inicio) params.set("semana_inicio", semana_inicio);

    const res = await fetch(`/api/frequencias?${params.toString()}`);
    const data = await res.json();
    if(!data.ok){
      showMsg("danger", data.error || "Erro ao carregar.");
      return;
    }
    hideMsg();

    tbody.innerHTML = (data.data || []).map(row).join("") || `
      <tr><td colspan="8" class="text-center text-secondary">Nenhum registro encontrado.</td></tr>
    `;
  }

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.total_aulas = Number(payload.total_aulas);
    payload.faltas = Number(payload.faltas);

    try{
      const res = await fetch("/api/frequencias", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if(!data.ok){
        showMsg("danger", data.error || "Erro ao salvar.");
        return;
      }

      if(data.frequencia.abaixo_80){
        showMsg("warning", `Salvo! ⚠️ ${data.frequencia.aluno.nome} ficou com ${data.frequencia.frequencia_percent}% e entrou em BUSCATIVA PENDENTE.`);
      }else{
        showMsg("success", "Salvo com sucesso!");
      }

      await load();
      form.faltas.value = "";
      form.total_aulas.value = "";
    }catch(err){
      showMsg("danger", "Falha de conexão com o servidor.");
    }
  });

  btnAtualizar.addEventListener("click", load);

  if(!form.semana_inicio.value){
    const d = new Date();
    const iso = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    form.semana_inicio.value = iso;
    filtroSemana.value = iso;
  }



// Selecionar todos
if(chkAll){
  chkAll.addEventListener("change", ()=>{
    const checked = chkAll.checked;
    document.querySelectorAll(".row-check").forEach(el => { el.checked = checked; });
  });
}

// Deletar selecionados (com senha)
if(btnDeletar){
  btnDeletar.addEventListener("click", async ()=>{
    const ids = Array.from(document.querySelectorAll(".row-check:checked")).map(el => el.getAttribute("data-id"));
    if(ids.length === 0){
      showMsg("warning", "Selecione pelo menos um registro (checkbox) para deletar.");
      return;
    }

    const pw = prompt("Digite a senha para DELETAR os registros selecionados:", "");
    if(pw === null) return; // cancel
    const password = (pw || "").trim();
    if(!password){
      showMsg("danger", "Senha obrigatória para deletar.");
      return;
    }

    // Confirmação extra
    const ok = confirm(`Tem certeza? Isso vai deletar ${ids.length} registro(s) de frequência.`);
    if(!ok) return;

    try{
      for(const id of ids){
        const res = await fetch(`/api/frequencias/${id}`, {
          method: "DELETE",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({password})
        });
        const data = await res.json();
        if(!data.ok){
          showMsg("danger", data.error || "Erro ao deletar.");
          return;
        }
      }
      showMsg("success", `Deletado(s) ${ids.length} registro(s) com sucesso!`);
      if(chkAll) chkAll.checked = false;
      await load();
    }catch(err){
      showMsg("danger", "Falha de conexão ao deletar.");
    }
  });
}

  load();
})();
