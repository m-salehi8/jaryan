#!/bin/sh

set -e

# If command arguments are provided (e.g. celery worker/beat), run them directly
# Only the default gunicorn server needs to run migrations
if [ "$1" = "celery" ]; then
    echo "==> Starting Celery: $@"
    exec "$@"
fi

echo "==> Waiting for database to be ready..."
python -c "
import os, time, psycopg2
host = os.environ.get('DB_HOST', 'db')
port = int(os.environ.get('DB_PORT', 5432))
user = os.environ.get('DB_USER', 'postgres')
password = os.environ.get('DB_PASS', 'postgres')
dbname = os.environ.get('DB_NAME', 'jaryan')
for i in range(30):
    try:
        conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname)
        conn.close()
        print('Database is ready!')
        break
    except Exception as e:
        print(f'Waiting for database... ({i+1}/30): {e}')
        time.sleep(2)
else:
    print('Database not ready after 60 seconds, exiting.')
    exit(1)
"

echo "==> Running Django migrations..."
python manage.py migrate --noinput

echo "==> Collecting static files..."
python manage.py collectstatic --noinput

echo "==> Starting Gunicorn..."
exec gunicorn jaryan.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
