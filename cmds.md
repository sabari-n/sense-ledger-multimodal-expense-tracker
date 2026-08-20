🛠️ Dev Commands
bash
# Start everything (first time or after code changes)
docker compose up -d --build
# Start without rebuilding images
docker compose up -d
# View live logs for all services
docker compose logs -f
# View logs for a specific service
docker compose logs -f api
docker compose logs -f client
docker compose logs -f whisper
docker compose logs -f ocr
# Restart a single service (e.g. after Python file change)
docker compose restart whisper
docker compose restart ocr
# Stop everything
docker compose down
# Stop + delete all data (full reset)
docker compose down -v



# Start everything in production mode
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# View logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# Stop
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Full reset
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
