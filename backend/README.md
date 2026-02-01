## Local Run

```bash
cd backend
cp .env.example .env
# Fill CLIMATIQ_API_KEY (and SERPAPI_KEY if you want URL search)

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# run test
cd backend
python tests/test_upload.py
