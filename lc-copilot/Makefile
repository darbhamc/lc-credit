.PHONY: install backend frontend seed test clean

install:
	cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
	cd frontend && npm install

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

seed:
	cd backend && .venv/bin/python -m app.seed

test:
	cd backend && .venv/bin/python -m pytest -q
	cd frontend && npm run typecheck

clean:
	rm -f backend/lc.db
	rm -rf backend/uploads
