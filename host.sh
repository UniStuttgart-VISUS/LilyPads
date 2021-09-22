#!/bin/sh

# server
source env/bin/activate
export FLASK_ENV='development'
exec gunicorn -b localhost:${LILYPADS_PORT:-8000} --reload lilypads:app

