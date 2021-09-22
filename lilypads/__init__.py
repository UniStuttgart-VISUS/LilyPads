#!/usr/bin/env python3

import socket
import sys
import datetime, time
import subprocess
import os, binascii
import ssl
import csv
import json
import gzip
import re
from functools import reduce
from flask import Flask, redirect, request, render_template, session, url_for, send_from_directory, jsonify, flash, abort
import flask
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
from urllib.parse import urlparse, urljoin
from passlib.hash import sha256_crypt
import sqlite3
import atexit
import logging
from logging.handlers import TimedRotatingFileHandler
from werkzeug.middleware.proxy_fix import ProxyFix

from .dataset import Dataset


access_logger = logging.getLogger('lilypads.access')
access_logger.addHandler(TimedRotatingFileHandler('access.log',
    when='midnight',
    interval=1,
    backupCount=10))
access_logger.setLevel(logging.INFO)

general_logger = logging.getLogger('lilypads.log')
err_handler = TimedRotatingFileHandler('lilypads.log',
    when='midnight',
    interval=1,
    backupCount=10)
err_handler.setFormatter(logging.Formatter(fmt='%(asctime)s  %(message)s', datefmt='%Y-%m-%dT%H:%M:%S'))
general_logger.addHandler(err_handler)
general_logger.setLevel(logging.INFO)


relpath = os.path.dirname(__file__)

app = Flask(__name__)
app.secret_key = b'uAOOWwcx6IqaDW8CO6Mgswf8oO2g/mCPqoaHc4/0bPM='
if app.config['ENV'] == 'development':
    app.config['TEMPLATES_AUTO_RELOAD'] = True

app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1, x_prefix=1)

login_manager = LoginManager()
login_manager.setup_app(app)

db = sqlite3.connect('users.db', detect_types=sqlite3.PARSE_DECLTYPES)
def _onclose():
    if db:
        db.close()
atexit.register(_onclose)

user_logged_out=False

version = None

def is_safe_url(target):
    ref_url = urlparse(request.host_url)
    test_url = urlparse(urljoin(request.host_url, target))
    return test_url.scheme in ('http', 'https') and \
           ref_url.netloc == test_url.netloc

# LOGIN
class User(UserMixin):
    def __init__(self, username, password, roles=None):
        self.id = username
        self.password = password
        self.roles = roles if roles is not None else []

    @classmethod
    def get(cls, id):
        # get user from db
        c = db.cursor()
        c.execute('SELECT id, password, expires, roles FROM users WHERE id = ?;', (id,))
        userdata = c.fetchone()
        if userdata is not None:
            expiry = userdata[2]
            if expiry is not None:
                expires = (userdata[2] - datetime.date.today()).days
                if expires <= 0:
                    general_logger.info('User %s tried to log in, account expired for %d days.', userdata[0], -expires)
                    return None, 'User account expired, please contact administrator.'

            # parse roles
            r = userdata[3]
            roles = [] if r is None else list(map(lambda x: x.strip(), r.split(',')))
            return User(userdata[0], userdata[1], roles), None
        return None, 'Wrong username or password.'

@login_manager.user_loader
def load_user(userid):
    user, _ = User.get(userid)
    return user

@app.route('/login', methods=['GET', 'POST'])
def login():
    global user_logged_out
    #This checks for the username in the 'database'.
    if request.method == 'GET':
        if current_user.is_authenticated:
            return redirect(url_for('get_root'))
        messages = []
        if user_logged_out:
            messages=[("success", "Logged out.")]
            user_logged_out = False

        return render_template('login.html', messages=messages)


    formdata = dict(request.form)

    username = formdata['uname']
    if type(username) is list:
        username = username[0]
    password = formdata['psw']
    if type(password) is list:
        password = password[0]
    rememberme = False
    if 'remember' in formdata:
        rememberme = True

    user,err = User.get(username)
    if user is not None:
        if sha256_crypt.verify(password, user.password):
            login_user(user, remember=rememberme)
            next = request.args.get('next')
            if not is_safe_url(next):
                return abort(400)

            return redirect(next or url_for('get_root'))

    return render_template('login.html', form=formdata, messages=[("danger", err if err is not None else 'Wrong username or password.')])

@app.route('/login.css')
def get_login_styles():
    return send_from_directory('content', 'login.css')

@app.route('/change_password', methods=['GET', 'POST'])
@login_required
def get_password_change_page():
    if request.method == 'GET':
        # get pwd change message(s), if exist
        msgs = []
        if '_pwd_change_messages' in session:
            msgs = session['_pwd_change_messages']
            del session['_pwd_change_messages']

        return render_template('password_change.html', messages=msgs)
    else:
        # get all
        formdata = dict(request.form)
        try:
            oldpwd = formdata['oldpwd']
            newpwd1 = formdata['psw1']
            newpwd2 = formdata['psw2']

            msgs = []
            if newpwd1 != newpwd2:
                msgs.append(('danger', 'New password repeated wrongly.'))
            elif len(newpwd1) < 8:
                msgs.append(('warning', 'Minimum password length is 8 characters.'))
            else:
                success, message = change_password(current_user.get_id(), oldpwd, newpwd1)
                msgs.append(('success' if success else 'danger', message))
            session['_pwd_change_messages'] = msgs
            return redirect('/change_password')
        except KeyError:
            session['_pwd_change_messages'] = [
                ('danger', 'Unfilled form data')
                    ]
            return redirect(url_for('get_password_change_page'))

@login_manager.unauthorized_handler
def unauthorized():
    return redirect(url_for('login'))

@app.route('/logout')
@login_required
def logout():
    global user_logged_out
    logout_user()
    user_logged_out = True
    return redirect(url_for('login'))


# load datasets
datasets = []
datasets_by_key = dict()
for entry in filter(lambda x: x.is_file() and x.path.endswith('.gz'),
        os.scandir(F'{relpath}/data/')):
    ds = Dataset(entry)
    datasets.append(ds)
    datasets_by_key[ds.key] = ds

general_logger.info('Loaded %d datasets.', len(datasets))

def get_title():
    global version
    if version is None:
        info = subprocess.check_output(['pip', 'show', 'lilypads'], universal_newlines=True)
        infos = list(map(lambda s: s.split(':', 2), info.split('\n')))
        versions = list(filter(lambda s: s[0] == 'Version', infos))
        if len(versions) > 0:
            version = 'LilyPads v' + versions[0][1].strip()
        else:
            version = "LilyPads"
    return version


@app.route('/data/<path:key>.json')
@login_required
def get_dataset(key):
    if key not in datasets_by_key:
        abort(404)
    dataset = datasets_by_key[key]
    if not dataset.allowed(current_user.roles):
        abort(403)

    if 'gzip' in request.headers.get('Accept-Encoding', '').lower():
        response = send_from_directory('data', F'{key}.gz')
        response.headers['Content-Type'] = 'application/json; encoding=utf-8'
        response.headers['Content-Encoding'] = 'gzip'
        response.headers['Vary'] = 'Accept-Encoding'
        return response
    else:
        return jsonify(dataset.content)

@app.route('/app/<path:path>')
@login_required
def get_static_file(path):
    return send_from_directory('content', path)

@app.route('/dist/<path:path>')
@login_required
def get_javascript(path):
    return send_from_directory('dist', path)

@app.route('/')
@login_required
def get_root():
    return redirect(url_for('get_main_page'))

@app.route('/index.html')
@login_required
def get_main_page():
    return render_template('index.html', username=current_user.get_id(), title=get_title())

@app.route('/api/articles/<string:corpus>/<int:index>')
@login_required
def get_article(corpus, index):
    if corpus not in datasets_by_key:
        abort(404)

    dataset = datasets_by_key[corpus]
    if not dataset.allowed(current_user.roles):
        abort(403)

    articles = dataset.articles
    if index not in articles:
        abort(404)

    _art = articles[index]
    article = {
            "date": _art['Date'],
            "location": _art['Location'],
            "newspaper": _art['Title (Newspaper)'],
            "text": _art['Text'],
            "url": _art['Link']
            }
    geo = dataset.geolocations[_art['place_id']]  # TODO
    article['coords'] = [ geo['geometry']['location']['lat'], geo['geometry']['location']['lng'] ]
    return render_template('article.html', article=article)

# DSGVO
@app.route('/impressum.html')
def dsgvo_impressum():
    return render_template('impressum.html')
@app.route('/datenschutz.html')
def dsgvo_datenschutz():
    return render_template('datenschutz.html')

# CHANGE DATASET
@app.route('/change_dataset')
@login_required
def change_dataset_site():
    dataset = request.args.get('current', None)
    ds = []
    for d in datasets:
        if d.allowed(current_user.roles):
            ds.append({
                'name': d.name,
                'id': d.key,
                'articles': d.length,
                'active': dataset == d.key,
            })
    return render_template('change_dataset.html', datasets=ds)

# USER MANAGEMENT
def change_password(username, old_password, new_password):
    c = db.cursor()

    c.execute('SELECT password FROM users WHERE id = ?;', (username,))
    data = c.fetchone()
    if data is None:
        return False, "User not found!"

    (pw,) = data

    # check old password
    if not sha256_crypt.verify(old_password, pw):
        return False, "Old password does not match!"
    new_hash = sha256_crypt.encrypt(new_password)
    c.execute('UPDATE users SET password = ? WHERE id = ?;', (new_hash, username))
    return True, "Password updated."

# use ETag, not Cache-Control: max-age
@app.after_request
def add_header(response):
    response.direct_passthrough = False
    response.add_etag()
    return response.make_conditional(request)

# access logging
_ipv4_remove = re.compile('(?P<oct0>\d{1,3})\.(?P<oct1>\d{1,3})\.\d{1,3}\.\d{1,3}')

@app.after_request
def access_log(resp):
    r = flask.request

    _remote_addr = _ipv4_remove.fullmatch(r.remote_addr)
    remote_addr = F'{_remote_addr["oct0"]}.{_remote_addr["oct1"]}.0.0' if _remote_addr else '-'

    logstring = F'''{remote_addr} - {current_user.id  if current_user.is_authenticated else "-"} [{datetime.datetime.now().astimezone().isoformat()}] "{r.method} {r.path} {r.environ.get("SERVER_PROTOCOL")}" {resp.status_code} {resp.content_length} "{r.referrer if r.referrer is not None else '-'}" "{r.user_agent}"'''
    logging.getLogger('lilypads.access').info(logstring)

    return resp
