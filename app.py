import os
from datetime import datetime, date
from flask import Flask, jsonify, request, render_template, session
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import relationship

db = SQLAlchemy()

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123##")


def normalize_database_url(url: str) -> str:
    '''
    Providers sometimes use postgres://
    SQLAlchemy wants postgresql://
    We also prefer psycopg (v3) driver: postgresql+psycopg://
    '''
    if not url:
        return url
    url = url.strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+psycopg" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    db_url = normalize_database_url(os.environ.get("DATABASE_URL", ""))
    if not db_url:
        # Fallback local (facilitates testing). On Render, set DATABASE_URL.
        db_url = "sqlite:///local.db"

    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    # -------------------- MODELS --------------------
    class Aluno(db.Model):
        __tablename__ = "alunos"
        id = db.Column(db.Integer, primary_key=True)
        nome = db.Column(db.String(200), nullable=False)
        ra = db.Column(db.String(50), nullable=True)
        turma = db.Column(db.String(50), nullable=False)
        ativo = db.Column(db.Boolean, default=True, nullable=False)
        criado_em = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

        frequencias = relationship("Frequencia", back_populates="aluno", cascade="all, delete-orphan")

        __table_args__ = (
            UniqueConstraint("ra", "turma", name="uq_aluno_ra_turma"),
        )

    class Frequencia(db.Model):
        __tablename__ = "frequencias"
        id = db.Column(db.Integer, primary_key=True)
        aluno_id = db.Column(db.Integer, db.ForeignKey("alunos.id", ondelete="CASCADE"), nullable=False)
        semana_inicio = db.Column(db.Date, nullable=False)
        total_aulas = db.Column(db.Integer, nullable=False)
        faltas = db.Column(db.Integer, nullable=False)
        frequencia_percent = db.Column(db.Float, nullable=False)
        atualizado_em = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
        criado_em = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

        aluno = relationship("Aluno", back_populates="frequencias")
        buscativa = relationship("Buscativa", back_populates="frequencia", uselist=False, cascade="all, delete-orphan")

        __table_args__ = (
            UniqueConstraint("aluno_id", "semana_inicio", name="uq_frequencia_aluno_semana"),
        )

    class Buscativa(db.Model):
        __tablename__ = "buscativas"
        id = db.Column(db.Integer, primary_key=True)
        frequencia_id = db.Column(
            db.Integer,
            db.ForeignKey("frequencias.id", ondelete="CASCADE"),
            nullable=False,
            unique=True
        )

        status = db.Column(db.String(20), nullable=False, default="pendente")  # pendente | feita | cancelada
        professor_nome = db.Column(db.String(120), nullable=True)
        sucesso = db.Column(db.Boolean, nullable=True)  # True/False when feita
        observacoes = db.Column(db.Text, nullable=True)

        data_criacao = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
        data_realizada = db.Column(db.DateTime, nullable=True)

        frequencia = relationship("Frequencia", back_populates="buscativa")

    # expose models
    app.Aluno = Aluno
    app.Frequencia = Frequencia
    app.Buscativa = Buscativa

    # -------------------- DB INIT --------------------
    with app.app_context():
        db.create_all()

    # -------------------- PAGES --------------------
    @app.get("/")
    def home():
        return render_template("home.html")

    @app.get("/frequencia")
    def page_frequencia():
        # Sempre pede senha ao abrir o módulo de Frequência
        session.pop("freq_auth", None)
        return render_template("frequencia_login.html", next_url="/painel_frequencia")

    @app.get("/painel_frequencia")
    def page_painel_frequencia():
        if not session.get("freq_auth"):
            session.pop("freq_auth", None)
        return render_template("frequencia_login.html", next_url="/painel_frequencia")
        return render_template("frequencia.html")

    @app.get("/gestao_frequencia")
    def page_gestao_frequencia():
        if not session.get("freq_auth"):
            return render_template("frequencia_login.html", next_url="/gestao_frequencia")
        return render_template("gestao_frequencia.html")

    @app.get("/buscativa")
    def page_buscativa():
        return render_template("buscativa.html")

    @app.get("/health")
    def health():
        return jsonify({"ok": True, "time": datetime.utcnow().isoformat()})

    @app.get("/api/auth/status")
    def api_auth_status():
        return jsonify({"ok": True, "freq_auth": bool(session.get("freq_auth"))})

    @app.post("/api/auth/frequencia")
    def api_auth_frequencia():
        payload = request.get_json(silent=True) or {}
        pw = (payload.get("password") or "").strip()
        if pw != ADMIN_PASSWORD:
            return jsonify({"ok": False, "error": "Senha incorreta."}), 401
        session["freq_auth"] = True
        return jsonify({"ok": True})

    @app.post("/api/auth/logout")
    def api_auth_logout():
        session.pop("freq_auth", None)
        return jsonify({"ok": True})

    # -------------------- HELPERS --------------------
    def require_freq_auth():
        if not session.get('freq_auth'):
            return jsonify({'ok': False, 'error': 'Acesso negado. Faça login na Frequência.'}), 401
        return None

    def parse_date(value: str) -> date:
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except Exception:
            raise ValueError("Data inválida. Use o formato YYYY-MM-DD.")

    def calc_freq(total_aulas: int, faltas: int) -> float:
        if total_aulas <= 0:
            raise ValueError("Total de aulas deve ser maior que 0.")
        if faltas < 0:
            raise ValueError("Faltas não pode ser negativo.")
        if faltas > total_aulas:
            raise ValueError("Faltas não pode ser maior que o total de aulas.")
        presencas = total_aulas - faltas
        return round((presencas / total_aulas) * 100.0, 2)

    # -------------------- API --------------------
    @app.get("/api/frequencias")
    def api_list_frequencias():
        auth = require_freq_auth()
        if auth:
            return auth
        turma = request.args.get("turma")
        semana_inicio = request.args.get("semana_inicio")  # YYYY-MM-DD

        q = Frequencia.query.join(Aluno).filter(Aluno.ativo.is_(True))
        if turma:
            q = q.filter(Aluno.turma == turma)
        if semana_inicio:
            try:
                s = parse_date(semana_inicio)
                q = q.filter(Frequencia.semana_inicio == s)
            except ValueError as e:
                return jsonify({"ok": False, "error": str(e)}), 400

        q = q.order_by(Aluno.turma.asc(), Aluno.nome.asc(), Frequencia.semana_inicio.desc())
        rows = q.all()

        out = []
        for f in rows:
            b = f.buscativa
            out.append({
                "id": f.id,
                "aluno": {"id": f.aluno.id, "nome": f.aluno.nome, "ra": f.aluno.ra, "turma": f.aluno.turma},
                "semana_inicio": f.semana_inicio.isoformat(),
                "total_aulas": f.total_aulas,
                "faltas": f.faltas,
                "frequencia_percent": f.frequencia_percent,
                "abaixo_80": f.frequencia_percent < 80.0,
                "buscativa": None if not b else {
                    "id": b.id,
                    "status": b.status,
                    "professor_nome": b.professor_nome,
                    "sucesso": b.sucesso,
                    "observacoes": b.observacoes,
                    "data_criacao": b.data_criacao.isoformat(),
                    "data_realizada": None if not b.data_realizada else b.data_realizada.isoformat(),
                }
            })
        return jsonify({"ok": True, "data": out})

    @app.post("/api/frequencias")
    def api_upsert_frequencia():
        auth = require_freq_auth()
        if auth:
            return auth
        payload = request.get_json(silent=True) or {}
        nome = (payload.get("nome") or "").strip()
        ra = (payload.get("ra") or "").strip() or None
        turma = (payload.get("turma") or "").strip()
        semana_inicio_s = (payload.get("semana_inicio") or "").strip()
        total_aulas = payload.get("total_aulas")
        faltas = payload.get("faltas")

        if not nome or not turma or not semana_inicio_s:
            return jsonify({"ok": False, "error": "Informe Nome, Turma e Semana (início)."}), 400

        try:
            semana_inicio = parse_date(semana_inicio_s)
        except ValueError as e:
            return jsonify({"ok": False, "error": str(e)}), 400

        try:
            total_aulas = int(total_aulas)
            faltas = int(faltas)
            freq = calc_freq(total_aulas, faltas)
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 400

        # get-or-create student
        aluno = None
        if ra:
            aluno = Aluno.query.filter_by(ra=ra, turma=turma).first()
        if not aluno:
            aluno = Aluno.query.filter_by(nome=nome, turma=turma).first()

        if not aluno:
            aluno = Aluno(nome=nome, ra=ra, turma=turma, ativo=True)
            db.session.add(aluno)
            db.session.flush()
        else:
            aluno.nome = nome
            aluno.turma = turma
            aluno.ra = ra or aluno.ra

        # upsert frequency
        f = Frequencia.query.filter_by(aluno_id=aluno.id, semana_inicio=semana_inicio).first()
        created = False
        if not f:
            f = Frequencia(
                aluno_id=aluno.id,
                semana_inicio=semana_inicio,
                total_aulas=total_aulas,
                faltas=faltas,
                frequencia_percent=freq
            )
            db.session.add(f)
            db.session.flush()
            created = True
        else:
            f.total_aulas = total_aulas
            f.faltas = faltas
            f.frequencia_percent = freq

        # buscativa logic
        abaixo_80 = freq < 80.0
        b = Buscativa.query.filter_by(frequencia_id=f.id).first()

        if abaixo_80:
            if not b:
                b = Buscativa(frequencia_id=f.id, status="pendente")
                db.session.add(b)
            else:
                if b.status == "cancelada":
                    b.status = "pendente"
                    b.professor_nome = None
                    b.sucesso = None
                    b.observacoes = None
                    b.data_realizada = None
        else:
            if b and b.status == "pendente":
                b.status = "cancelada"

        db.session.commit()

        return jsonify({
            "ok": True,
            "created": created,
            "frequencia": {
                "id": f.id,
                "aluno": {"id": aluno.id, "nome": aluno.nome, "ra": aluno.ra, "turma": aluno.turma},
                "semana_inicio": f.semana_inicio.isoformat(),
                "total_aulas": f.total_aulas,
                "faltas": f.faltas,
                "frequencia_percent": f.frequencia_percent,
                "abaixo_80": abaixo_80,
            },
            "buscativa": None if not f.buscativa else {"id": f.buscativa.id, "status": f.buscativa.status}
        })

    @app.delete("/api/frequencias/<int:freq_id>")
    def api_delete_frequencia(freq_id: int):
        auth = require_freq_auth()
        if auth:
            return auth
        payload = request.get_json(silent=True) or {}
        pw = (payload.get("password") or "").strip()
        if pw != ADMIN_PASSWORD:
            return jsonify({"ok": False, "error": "Senha incorreta."}), 401
        f = Frequencia.query.get(freq_id)
        if not f:
            return jsonify({"ok": False, "error": "Registro de frequência não encontrado."}), 404
        db.session.delete(f)
        db.session.commit()
        return jsonify({"ok": True})

    @app.get("/api/buscativas")
    def api_list_buscativas():
        status = request.args.get("status")  # pendente | feita | cancelada
        turma = request.args.get("turma")
        semana_inicio = request.args.get("semana_inicio")

        q = Buscativa.query.join(Frequencia).join(Aluno).filter(Aluno.ativo.is_(True))

        if status:
            q = q.filter(Buscativa.status == status)
        if turma:
            q = q.filter(Aluno.turma == turma)
        if semana_inicio:
            try:
                s = parse_date(semana_inicio)
                q = q.filter(Frequencia.semana_inicio == s)
            except ValueError as e:
                return jsonify({"ok": False, "error": str(e)}), 400

        q = q.order_by(Buscativa.status.asc(), Frequencia.semana_inicio.desc(), Aluno.turma.asc(), Aluno.nome.asc())
        rows = q.all()

        out = []
        for b in rows:
            f = b.frequencia
            a = f.aluno
            out.append({
                "id": b.id,
                "status": b.status,
                "professor_nome": b.professor_nome,
                "sucesso": b.sucesso,
                "observacoes": b.observacoes,
                "data_criacao": b.data_criacao.isoformat(),
                "data_realizada": None if not b.data_realizada else b.data_realizada.isoformat(),
                "frequencia": {
                    "id": f.id,
                    "semana_inicio": f.semana_inicio.isoformat(),
                    "total_aulas": f.total_aulas,
                    "faltas": f.faltas,
                    "frequencia_percent": f.frequencia_percent,
                },
                "aluno": {"id": a.id, "nome": a.nome, "ra": a.ra, "turma": a.turma}
            })

        return jsonify({"ok": True, "data": out})

    @app.put("/api/buscativas/<int:buscativa_id>")
    def api_update_buscativa(buscativa_id: int):
        payload = request.get_json(silent=True) or {}
        professor_nome = (payload.get("professor_nome") or "").strip()
        sucesso = payload.get("sucesso", None)
        observacoes = (payload.get("observacoes") or "").strip()

        if not professor_nome:
            return jsonify({"ok": False, "error": "Informe o nome do professor."}), 400
        if sucesso not in (True, False):
            return jsonify({"ok": False, "error": "Informe se a buscativa teve sucesso (sim/não)."}), 400

        b = Buscativa.query.get(buscativa_id)
        if not b:
            return jsonify({"ok": False, "error": "Buscativa não encontrada."}), 404

        if b.status != "pendente":
            return jsonify({"ok": False, "error": f"Buscativa já está '{b.status}'. Não é possível registrar novamente."}), 400

        b.status = "feita"
        b.professor_nome = professor_nome
        b.sucesso = bool(sucesso)
        b.observacoes = observacoes
        b.data_realizada = datetime.utcnow()

        db.session.commit()
        return jsonify({"ok": True, "data": {"id": b.id, "status": b.status}})

    @app.get("/api/turmas")
    def api_turmas():
        turmas = [t[0] for t in db.session.query(Aluno.turma).distinct().order_by(Aluno.turma.asc()).all()]
        return jsonify({"ok": True, "data": turmas})

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)
