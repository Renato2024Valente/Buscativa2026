(function(){
  const form = document.getElementById("formFrequencia");
  const msgBox = document.getElementById("msgBox");
  const prevFreq = document.getElementById("prevFreq");
  const inpAulas = document.getElementById("total_aulas");
  const inpFaltas = document.getElementById("faltas");
  const tbody = document.getElementById("tbodyFrequencias");
  const filtroTurma = document.getElementById("filtroTurma");
  const filtroSemana = document.getElementById("filtroSemana");
  const btnAtualizar = document.getElementById("btnAtualizar");
  const btnDeletar = document.getElementById("btnDeletar");
  const chkAll = document.getElementById("chkAll");

  function showMsg(kind, text){
    if(!msgBox) return;
    msgBox.classList.remove("d-none","alert-success","alert-danger","alert-warning","alert-info");
    msgBox.classList.add("alert", `alert-${kind}`);
    msgBox.textContent = text;
  }

function updatePreview(){
  if(!prevFreq) return;
  const aulas = Number(inpAulas?.value || 0);
  const faltas = Number(inpFaltas?.value || 0);
  if(!aulas || aulas <= 0){
    prevFreq.textContent = "";
    return;
  }
  const presencas = Math.max(0, aulas - Math.max(0, faltas));
  const pct = Math.round((presencas / aulas) * 10000) / 100;
  const warn = pct < 80 ? "⚠️ Abaixo de 80% (vai para BUSCATIVA)" : "✅ OK";
  prevFreq.innerHTML = `Frequência prevista: <b>${pct.toFixed(2)}%</b> — ${warn}`;
}

  function hideMsg(){ if(msgBox) msgBox.classList.add("d-none"); }

  function badge(status){
    if(!status) return "";
    if(status === "pendente") return `<span class="badge bg-warning text-dark">Buscativa pendente</span>`;
    if(status === "feita") return `<span class="badge bg-success">Buscativa feita</span>`;
    if(status === "cancelada") return `<span class="badge bg-secondary">Buscativa cancelada</span>`;
    return "";
  }


function fmtDate(iso){
  if(!iso) return "—";
  try{
    const d = new Date(iso);
    return d.toLocaleString();
  }catch(e){
    return iso;
  }
}

function shortText(t, max=60){
  if(!t) return "";
  const s = String(t).trim().replace(/\s+/g, " ");
  if(s.length <= max) return s;
  return s.slice(0, max-1) + "…";
}

function renderObs(f){
  const b = f.buscativa;
  if(!b) return `<span class="text-secondary small">—</span>`;

  const prof = b.professor_nome ? b.professor_nome : "—";
  const res = (b.sucesso === true) ? "Sucesso" : (b.sucesso === false ? "Sem sucesso" : "—");
  const obs = b.observacoes ? shortText(b.observacoes, 70) : "";
  const showBtn = b.observacoes || b.professor_nome || b.sucesso !== null;

  if(!showBtn){
    return `<span class="text-secondary small">—</span>`;
  }

  return `
    <div class="vstack gap-1">
      <div class="small text-secondary">Prof.: ${prof}</div>
      <div class="small">${res}${obs ? ` — <span class="text-secondary">${obs}</span>` : ""}</div>
      <button class="btn btn-sm btn-outline-light btn-obs" type="button"
        data-aluno="${encodeURIComponent(f.aluno.nome)}"
        data-turma="${encodeURIComponent(f.aluno.turma)}"
        data-prof="${encodeURIComponent(prof)}"
        data-res="${encodeURIComponent(res)}"
        data-obs="${encodeURIComponent(b.observacoes || '')}"
        data-criada="${encodeURIComponent(b.data_criacao || '')}"
        data-realizada="${encodeURIComponent(b.data_realizada || '')}"
      >Ver</button>
    </div>
  `;
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
        <td>${renderObs(f)}</td>
      </tr>
    `;
  }

  async function load(){
    const turma = (filtroTurma?.value || "").trim();
    const semana_inicio = (filtroSemana?.value || "").trim();

    const params = new URLSearchParams();
    if(turma) params.set("turma", turma);
    if(semana_inicio) params.set("semana_inicio", semana_inicio);

    const res = await fetch(`/api/frequencias?${params.toString()}`);
    const data = await res.json();

    if(!data.ok){
      showMsg("danger", data.error || "Erro ao carregar.");
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-secondary">Sem dados.</td></tr>`;
      return;
    }

    hideMsg();
    tbody.innerHTML = (data.data || []).map(row).join("") || `
      <tr><td colspan="9" class="text-center text-secondary">Nenhum registro encontrado.</td></tr>
    `;
  }

  // Salvar frequência (lançamento)
  if(form){
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
      if(pw === null) return;
      const password = (pw || "").trim();
      if(!password){
        showMsg("danger", "Senha obrigatória para deletar.");
        return;
      }

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

  if(btnAtualizar){
    btnAtualizar.addEventListener("click", load);
  }

  // Prévia de porcentagem
  if(inpAulas) inpAulas.addEventListener('input', updatePreview);
  if(inpFaltas) inpFaltas.addEventListener('input', updatePreview);
  updatePreview();

  // Datas padrão
  const todayIso = new Date(Date.now() - (new Date().getTimezoneOffset()*60000)).toISOString().slice(0,10);
  if(document.getElementById("semana_inicio") && !document.getElementById("semana_inicio").value){
    document.getElementById("semana_inicio").value = todayIso;
  }
  if(filtroSemana && !filtroSemana.value){
    filtroSemana.value = todayIso;
  }


// Abrir modal de observações da buscativa
document.addEventListener("click", (e)=>{
  const btn = e.target.closest(".btn-obs");
  if(!btn) return;

  const aluno = decodeURIComponent(btn.getAttribute("data-aluno") || "—");
  const turma = decodeURIComponent(btn.getAttribute("data-turma") || "");
  const prof = decodeURIComponent(btn.getAttribute("data-prof") || "—");
  const res = decodeURIComponent(btn.getAttribute("data-res") || "—");
  const obs = decodeURIComponent(btn.getAttribute("data-obs") || "");
  const criada = decodeURIComponent(btn.getAttribute("data-criada") || "");
  const realizada = decodeURIComponent(btn.getAttribute("data-realizada") || "");

  const elAluno = document.getElementById("obsAluno");
  const elProf = document.getElementById("obsProfessor");
  const elRes = document.getElementById("obsResultado");
  const elTxt = document.getElementById("obsTexto");
  const elCriada = document.getElementById("obsCriada");
  const elReal = document.getElementById("obsRealizada");

  if(elAluno) elAluno.textContent = turma ? `${aluno} (${turma})` : aluno;
  if(elProf) elProf.textContent = prof || "—";
  if(elRes) elRes.textContent = res || "—";
  if(elTxt) elTxt.textContent = obs ? obs : "—";
  if(elCriada) elCriada.textContent = fmtDate(criada);
  if(elReal) elReal.textContent = fmtDate(realizada);

  try{
    const modalEl = document.getElementById("modalObs");
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }catch(err){
    // fallback
    alert(obs || "Sem observações.");
  }
});

  load();
})();
