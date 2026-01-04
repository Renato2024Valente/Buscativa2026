# Buscativa + Frequência (Flask + PostgreSQL)

Sistema com 2 páginas:
- **Frequência**: registra a frequência semanal (total de aulas e faltas).
  Se ficar **abaixo de 80%**, o sistema cria automaticamente uma **buscativa pendente**.
- **Buscativa**: lista os alunos pendentes com **alerta visual** e permite registrar:
  - Nome do professor
  - Se teve sucesso (Sim/Não)
  - Observações

## Rodar local (teste)
1. Crie venv e instale:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Rode:
   ```bash
   python app.py
   ```
3. Abra:
   - http://localhost:5000/frequencia
   - http://localhost:5000/buscativa

> Se `DATABASE_URL` não estiver definido, ele usa `sqlite:///local.db` automaticamente.

## Deploy no Render (PostgreSQL)
1. Suba este projeto para um GitHub (ou faça upload no Render).
2. Crie um **Web Service** no Render apontando para o repositório.
3. Em **Environment**, configure:
   - `DATABASE_URL` com a sua string do PostgreSQL do Render (não coloque no código).
   - `SECRET_KEY` (o render.yaml já gera automaticamente, se você usar).

4. O start está pronto: `gunicorn app:app`

## Regras de negócio
- Frequência < 80%: cria/atualiza buscativa como **pendente**
- Frequência >= 80% e buscativa pendente: marca buscativa como **cancelada**
- Ao registrar buscativa: status vira **feita** e salva professor, sucesso e observações


### Observação (Windows)
- No Windows você roda com `python app.py` (Gunicorn é usado no Render/Linux).
