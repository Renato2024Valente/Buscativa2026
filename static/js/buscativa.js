(function(){
  const tbody = document.getElementById("tbodyBuscativas");
  const filtroTurma = document.getElementById("filtroTurmaB");
  const filtroStatus = document.getElementById("filtroStatus");
  const filtroSemana = document.getElementById("filtroSemanaB");
  const btnAtualizar = document.getElementById("btnAtualizarB");
  const alertPendentes = document.getElementById("alertPendentes");
  const btnBeep = document.getElementById("btnBeep");

  const modalEl = document.getElementById("modalRegistrar");
  const modal = new bootstrap.Modal(modalEl);
  const form = document.getElementById("formRegistrar");
  const msgModal = document.getElementById("msgModal");
  const modalInfo = document.getElementById("modalInfo");
  const btnSalvar = document.getElementById("btnSalvarRegistro");

  function showMsg(kind, text){
    msgModal.classList.remove("d-none","alert-success","alert-danger","alert-warning","alert-info");
    msgModal.classList.add("alert", `alert-${kind}`);
    msgModal.textContent = text;
  }
  function hideMsg(){ msgModal.classList.add("d-none"); }

  function beep(durationMs=250, freq=880){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.06;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(()=>{ osc.stop(); ctx.close(); }, durationMs);
    }catch(e){}
  }

  function statusBadge(s){
    if(s === "pendente") return `<span class="badge bg-warning text-dark">Pendente</span>`;
    if(s === "feita") return `<span class="badge bg-success">Feita</span>`;
    if(s === "cancelada") return `<span class="badge bg-secondary">Cancelada</span>`;
    return `<span class="badge bg-info">-</span>`;
  }
  function fmtBool(v){
    if(v === true) return "Sim";
    if(v === false) return "Não";
    return "-";
  }

  function row(b){
    const isPend = b.status === "pendente";
    const cls = isPend ? "row-pendente" : "";
    const action = isPend
      ? `<button class="btn btn-sm btn-primary" data-action="registrar" data-id="${b.id}">Registrar</button>`
      : `<span class="text-secondary small">-</span>`;

    const obs = b.observacoes ? b.observacoes.replace(/[<>&]/g, (c)=>({ "<":"&lt;",">":"&gt;","&":"&amp;" }[c])) : "-";

    return `
      <tr class="${cls}">
        <td>${statusBadge(b.status)}</td>
        <td class="fw-semibold">${b.aluno.turma}</td>
        <td>${b.aluno.nome}${b.aluno.ra ? ` <span class="text-secondary small">(RA ${b.aluno.ra})</span>` : ""}</td>
        <td>${b.frequencia.semana_inicio}</td>
        <td class="text-end"><span class="fw-bold">${Number(b.frequencia.frequencia_percent).toFixed(2)}%</span></td>
        <td>${b.professor_nome || "-"}</td>
        <td>${fmtBool(b.sucesso)}</td>
        <td class="text-truncate" style="max-width: 320px" title="${obs}">${obs}</td>
        <td class="text-end">${action}</td>
      </tr>
    `;
  }

  async function load(){
    const turma = (filtroTurma.value || "").trim();
    const status = (filtroStatus.value || "").trim();
    const semana_inicio = (filtroSemana.value || "").trim();

    const params = new URLSearchParams();
    if(turma) params.set("turma", turma);
    if(status) params.set("status", status);
    if(semana_inicio) params.set("semana_inicio", semana_inicio);

    const res = await fetch(`/api/buscativas?${params.toString()}`);
    const data = await res.json();
    if(!data.ok){
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">${data.error || "Erro ao carregar."}</td></tr>`;
      alertPendentes.classList.add("d-none");
      return;
    }

    const rows = data.data || [];
    tbody.innerHTML = rows.map(row).join("") || `<tr><td colspan="9" class="text-center text-secondary">Nenhuma buscativa encontrada.</td></tr>`;

    const hasPending = rows.some(r => r.status === "pendente");
    const watchingPending = (!status || status === "pendente");
    if(hasPending && watchingPending){
      alertPendentes.classList.remove("d-none");
      beep(180, 880);
      setTimeout(()=>beep(180, 660), 220);
    }else{
      alertPendentes.classList.add("d-none");
    }
  }

  tbody.addEventListener("click", async (e)=>{
    const btn = e.target.closest("button[data-action='registrar']");
    if(!btn) return;
    const id = btn.getAttribute("data-id");

    const turma = (filtroTurma.value || "").trim();
    const params = new URLSearchParams();
    if(turma) params.set("turma", turma);
    params.set("status","pendente");

    const res = await fetch(`/api/buscativas?${params.toString()}`);
    const data = await res.json();
    const item = (data.data || []).find(x => String(x.id) === String(id));
    if(!item) return;

    form.reset();
    hideMsg();
    document.getElementById("buscativaId").value = id;
    modalInfo.textContent = `${item.aluno.nome} • Turma ${item.aluno.turma} • Semana ${item.frequencia.semana_inicio} • Frequência ${Number(item.frequencia.frequencia_percent).toFixed(2)}%`;
    modal.show();
  });

  btnSalvar.addEventListener("click", async ()=>{
    hideMsg();
    const fd = new FormData(form);
    const buscativa_id = fd.get("buscativa_id");
    const professor_nome = (fd.get("professor_nome") || "").trim();
    const sucesso = fd.get("sucesso");
    const observacoes = (fd.get("observacoes") || "").trim();

    if(!professor_nome){
      showMsg("danger", "Informe o nome do professor.");
      return;
    }
    if(sucesso !== "true" && sucesso !== "false"){
      showMsg("danger", "Marque se teve sucesso (Sim/Não).");
      return;
    }

    const payload = { professor_nome, sucesso: sucesso === "true", observacoes };

    try{
      const res = await fetch(`/api/buscativas/${buscativa_id}`, {
        method: "PUT",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if(!data.ok){
        showMsg("danger", data.error || "Erro ao salvar.");
        return;
      }
      showMsg("success", "Registro salvo! ✅");
      beep(200, 880);
      setTimeout(()=>beep(140, 990), 220);
      setTimeout(()=>{ modal.hide(); load(); }, 450);
    }catch(err){
      showMsg("danger", "Falha de conexão com o servidor.");
    }
  });

  btnAtualizar.addEventListener("click", load);
  btnBeep.addEventListener("click", ()=>{ beep(180, 880); setTimeout(()=>beep(180, 660), 220); });

  if(!filtroSemana.value){
    const d = new Date();
    const iso = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    filtroSemana.value = iso;
  }

  load();
})();
